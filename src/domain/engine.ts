import { calculateBarbarianAttack } from "./barbarian";
import { accrueGameClock, createGameClock, parseIsoTimestamp } from "./clock";
import {
  createEventDeck,
  createNumberedDeck,
  drawEventFace,
  drawNumberedOutcome,
} from "./decks";
import { domainError, failure, success } from "./errors";
import { validateGameState, validateSetup } from "./invariants";
import { proposeMetropolisChange } from "./metropolis";
import { eligiblePlayersForProgress } from "./progress";
import {
  DEFAULT_BARBARIAN_TRACK_LENGTH,
  DEFAULT_KNIGHT_COMPONENT_LIMIT_PER_LEVEL,
  DISCIPLINES,
} from "./rules";
import {
  currentPlayer,
  metropolisCountForPlayer,
  scoreForPlayer,
  winnerCandidates,
} from "./selectors";
import { createThematicState, scheduleThematicEvent } from "./thematic";
import type {
  BarbarianAttackOutcome,
  BarbarianAttackRecord,
  CreateGameInput,
  Decision,
  DieValue,
  DomainDeps,
  DomainResult,
  EventOccurrenceId,
  GameCommand,
  GameState,
  ImprovementLevels,
  KnightCounts,
  MetropolisControl,
  MetropolisDiscipline,
  PlayerId,
  PlayerState,
  ProgressDiscipline,
  ProposalId,
  PublicStatePatch,
  RollId,
  RollRecord,
  ScoreEntry,
  ScoreEntryId,
} from "./types";

export function createGame(input: CreateGameInput): DomainResult<Decision> {
  const setupErrors = validateSetup(input.setup);
  if (setupErrors.length > 0) {
    return failure(
      setupErrors[0] ?? domainError("INVALID_SETUP", "Game setup is invalid."),
    );
  }
  const players: PlayerState[] = input.setup.players.map((player, order) => ({
    id: player.id,
    name: player.name.trim(),
    color: { ...player.color },
    order,
    ordinaryCities: player.ordinaryCities ?? 1,
    activeKnights: {
      basic: player.activeKnights?.basic ?? 0,
      strong: player.activeKnights?.strong ?? 0,
      mighty: player.activeKnights?.mighty ?? 0,
    },
    improvements: {
      science: player.improvements?.science ?? 0,
      trade: player.improvements?.trade ?? 0,
      politics: player.improvements?.politics ?? 0,
    },
  }));
  const scoreLedger: ScoreEntry[] = input.setup.players.flatMap((player) => {
    const initialScore = player.initialScore ?? 3;
    return initialScore === 0
      ? []
      : [
          {
            id: nextScoreEntryId(input.ids),
            playerId: player.id,
            delta: initialScore,
            reason: "initial" as const,
            createdAt: input.createdAt,
          },
        ];
  });
  const firstPlayerIndex = players.findIndex(
    (player) => player.id === input.setup.firstPlayerId,
  );
  const state: GameState = {
    id: input.gameId,
    revisionId: input.revisionId,
    revisionNumber: 1,
    status: "active",
    winnerId: null,
    setup: cloneSetup(input.setup),
    turn: {
      phase: "awaiting-roll",
      currentPlayerIndex: firstPlayerIndex,
      round: 1,
      turnNumber: 1,
      completedTurns: 0,
    },
    clock: createGameClock(
      players.map((player) => player.id),
      input.createdAt,
    ),
    players,
    metropolises: {
      controls: { science: null, trade: null, politics: null },
      pendingProposal: null,
    },
    numberedDeck: createNumberedDeck(input.random, input.revisionId),
    eventDeck: createEventDeck(input.random, input.revisionId),
    thematicEvents: createThematicState(
      input.setup.thematicEventsEnabled,
      input.setup.thematicCadence,
      input.setup.thematicEventCatalog,
      input.random,
      input.revisionId,
    ),
    barbarian: {
      shipPosition: 0,
      robberActivated: false,
      attacksCompleted: 0,
      rules: {
        trackLength:
          input.barbarianRules?.trackLength ?? DEFAULT_BARBARIAN_TRACK_LENGTH,
        knightComponentLimitPerLevel:
          input.barbarianRules?.knightComponentLimitPerLevel ??
          DEFAULT_KNIGHT_COMPONENT_LIMIT_PER_LEVEL,
      },
      pendingAttack: null,
      history: [],
    },
    resolution: { official: null },
    scoreLedger,
    lastRoll: null,
    statistics: {
      totalRolls: 0,
      normalRolls: 0,
      alchemyRolls: 0,
      completedTurns: 0,
      completedRounds: 0,
      numberedTotals: Object.fromEntries(
        Array.from({ length: 11 }, (_, index) => [String(index + 2), 0]),
      ),
      eventFaces: {
        barbarian: 0,
        science: 0,
        trade: 0,
        politics: 0,
      },
      barbarianAttacksWon: 0,
      barbarianAttacksLost: 0,
      thematicEventsTriggered: 0,
    },
    history: { rolls: [], thematicEvents: [] },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  const errors = validateGameState(state);
  if (errors.length > 0) {
    return failure(
      errors[0] ??
        domainError("INVARIANT_VIOLATION", "Created game is invalid."),
    );
  }
  return success({
    nextState: state,
    summary: {
      kind: "game-created",
      text: `Created ${state.setup.title}.`,
      playerIds: state.players.map((player) => player.id),
    },
    presentation: {
      type: "game-created",
      currentPlayerId: currentPlayer(state).id,
      houseRules: [
        "Balanced numbered deck",
        "Balanced event deck",
        ...(state.thematicEvents.enabled ? ["Thematic events"] : []),
        ...(state.setup.mode === "two-player-house-rule"
          ? ["Two-player mode"]
          : []),
        ...(state.setup.victoryTarget !== 13 ? ["Custom victory target"] : []),
      ],
    },
  });
}

export function decide(
  state: GameState,
  command: GameCommand,
  deps: DomainDeps,
): DomainResult<Decision> {
  const existingErrors = validateGameState(state);
  if (existingErrors.length > 0) {
    return failure(
      existingErrors[0] ??
        domainError("INVARIANT_VIOLATION", "Current game is invalid."),
    );
  }
  if (state.status !== "active") {
    return failure(
      domainError("NO_ACTIVE_GAME", "The game is already completed."),
    );
  }
  if (state.clock?.pausedAt !== null && state.clock?.pausedAt !== undefined) {
    if (command.type !== "clock.resumed") {
      return failure(
        domainError(
          "CLOCK_PAUSED",
          "Resume the game clock before issuing another command.",
        ),
      );
    }
  }
  if (parseIsoTimestamp(deps.at) === null) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "Command time must be a valid ISO timestamp.",
      ),
    );
  }

  switch (command.type) {
    case "clock.started":
      return startClock(state, deps);
    case "clock.paused":
      return pauseClock(state, deps);
    case "clock.resumed":
      return resumeClock(state, deps);
    case "roll.draw":
    case "roll.alchemy":
    case "resolution.progressAcknowledged":
    case "resolution.productionAcknowledged":
    case "player.publicStateAdjusted":
    case "metropolis.assignmentProposed":
    case "metropolis.correctionProposed":
    case "metropolis.proposalConfirmed":
    case "metropolis.proposalCancelled":
    case "attack.confirmed":
    case "event.acknowledged":
    case "turn.ended":
    case "game.completed": {
      const accrued = accrueGameClock(state, deps.at);
      return accrued.ok
        ? decideNormal(accrued.value, command, deps)
        : failure(accrued.error);
    }
    default:
      return exhaustiveCommand(command);
  }
}

function decideNormal(
  state: GameState,
  command: Exclude<
    GameCommand,
    | { type: "clock.started" }
    | { type: "clock.paused" }
    | { type: "clock.resumed" }
  >,
  deps: DomainDeps,
): DomainResult<Decision> {
  switch (command.type) {
    case "roll.draw":
      return roll(state, deps, null);
    case "roll.alchemy":
      return roll(state, deps, { red: command.red, yellow: command.yellow });
    case "resolution.progressAcknowledged":
      return acknowledgeProgress(state, command.rollId, deps);
    case "resolution.productionAcknowledged":
      return acknowledgeProduction(state, command.rollId, deps);
    case "player.publicStateAdjusted":
      return adjustPlayer(state, command.playerId, command.patch, deps);
    case "metropolis.assignmentProposed":
      return proposeMetropolisCommand(
        state,
        command.discipline,
        command.holderId,
        command.status,
        "improvement",
        deps,
      );
    case "metropolis.correctionProposed":
      return proposeMetropolisCommand(
        state,
        command.discipline,
        command.holderId,
        command.status,
        "correction",
        deps,
      );
    case "metropolis.proposalConfirmed":
      return confirmMetropolis(state, command.proposalId, deps);
    case "metropolis.proposalCancelled":
      return cancelMetropolis(state, command.proposalId, deps);
    case "attack.confirmed":
      return confirmAttack(
        state,
        command.proposalId,
        command.progressChoices ?? [],
        deps,
      );
    case "event.acknowledged":
      return acknowledgeThematicEvent(state, command.occurrenceId, deps);
    case "turn.ended":
      return endTurn(state, deps);
    case "game.completed":
      return completeGame(state, command.winnerId, deps);
    default:
      return exhaustiveCommand(command);
  }
}

function startClock(
  state: GameState,
  deps: DomainDeps,
): DomainResult<Decision> {
  if (state.clock !== undefined) {
    return failure(
      domainError("INVALID_COMMAND", "The game clock is already initialized."),
    );
  }
  const candidate: GameState = {
    ...state,
    clock: createGameClock(
      state.players.map((player) => player.id),
      deps.at,
    ),
  };
  return commit(
    candidate,
    deps,
    {
      kind: "clock-started",
      text: "Started the game clock.",
      playerIds: [currentPlayer(state).id],
    },
    { type: "clock-started", at: deps.at },
  );
}

function pauseClock(
  state: GameState,
  deps: DomainDeps,
): DomainResult<Decision> {
  if (state.clock === undefined || state.clock.runningSince === null) {
    return failure(
      domainError("INVALID_COMMAND", "The game clock is not running."),
    );
  }
  const accrued = accrueGameClock(state, deps.at);
  if (!accrued.ok) {
    return failure(accrued.error);
  }
  const candidate: GameState = {
    ...accrued.value,
    clock: {
      ...accrued.value.clock!,
      runningSince: null,
      pausedAt: deps.at,
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "clock-paused",
      text: "Paused the game clock.",
      playerIds: [currentPlayer(state).id],
    },
    { type: "clock-paused", at: deps.at },
  );
}

function resumeClock(
  state: GameState,
  deps: DomainDeps,
): DomainResult<Decision> {
  if (
    state.clock === undefined ||
    state.clock.pausedAt === null ||
    state.clock.runningSince !== null
  ) {
    return failure(
      domainError("INVALID_COMMAND", "The game clock is not paused."),
    );
  }
  const candidate: GameState = {
    ...state,
    clock: {
      ...state.clock,
      runningSince: deps.at,
      pausedAt: null,
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "clock-resumed",
      text: "Resumed the game clock.",
      playerIds: [currentPlayer(state).id],
    },
    { type: "clock-resumed", at: deps.at },
  );
}

function roll(
  state: GameState,
  deps: DomainDeps,
  alchemy: { red: DieValue; yellow: DieValue } | null,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "awaiting-roll");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  if (
    alchemy !== null &&
    (!isDieValue(alchemy.red) || !isDieValue(alchemy.yellow))
  ) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "Alchemy die values must each be from 1 through 6.",
      ),
    );
  }

  const eventDraw = drawEventFace(
    state.eventDeck,
    deps.random,
    deps.revisionId,
  );
  if (!eventDraw.ok) {
    return failure(eventDraw.error);
  }
  const numberedDraw =
    alchemy === null
      ? drawNumberedOutcome(state.numberedDeck, deps.random, deps.revisionId)
      : null;
  if (numberedDraw !== null && !numberedDraw.ok) {
    return failure(numberedDraw.error);
  }
  const numbered =
    alchemy ??
    (numberedDraw?.ok ? numberedDraw.value.value : { red: 1, yellow: 1 });
  const total = numbered.red + numbered.yellow;
  const progress =
    eventDraw.value.value === "barbarian"
      ? null
      : {
          discipline: eventDraw.value.value,
          eligiblePlayerIds: eligiblePlayersForProgress(
            state,
            eventDraw.value.value,
            numbered.red,
          ),
          red: numbered.red,
        };
  const production =
    total === 7
      ? ({
          type: "seven",
          robberActive: state.barbarian.robberActivated,
          reminder: state.barbarian.robberActivated
            ? "discard-and-move-robber"
            : "robber-not-yet-active",
        } as const)
      : ({ type: "production", total } as const);

  const thematic = scheduleThematicEvent(
    state.thematicEvents,
    state.turn.completedTurns,
    state.players.length,
    deps.random,
    deps.revisionId,
    nextEventOccurrenceId(deps.ids),
  );
  if (!thematic.ok) {
    return failure(thematic.error);
  }

  const rollId = nextRollId(deps.ids);
  let barbarian = state.barbarian;
  if (eventDraw.value.value === "barbarian") {
    const shipPosition = barbarian.shipPosition + 1;
    barbarian = { ...barbarian, shipPosition };
    if (shipPosition === barbarian.rules.trackLength) {
      const proposal = calculateBarbarianAttack(
        {
          ...state,
          barbarian,
        },
        nextProposalId(deps.ids),
      );
      barbarian = { ...barbarian, pendingAttack: proposal };
    }
  }

  const record: RollRecord = {
    id: rollId,
    playerId: currentPlayer(state).id,
    turnNumber: state.turn.turnNumber,
    round: state.turn.round,
    numbered,
    total,
    eventFace: eventDraw.value.value,
    alchemy: alchemy !== null,
    numberedDeckCycle:
      alchemy === null && numberedDraw?.ok
        ? numberedDraw.value.cycle
        : state.numberedDeck.cycle,
    numberedDeckIndex:
      alchemy === null && numberedDraw?.ok ? numberedDraw.value.index : null,
    eventDeckCycle: eventDraw.value.cycle,
    eventDeckIndex: eventDraw.value.index,
    progress,
    production,
    thematicEventOccurrenceId: thematic.value.event?.occurrenceId ?? null,
    createdAt: deps.at,
  };
  const official = {
    rollId,
    progressPending: progress !== null,
    productionPending: true,
  };
  const phase =
    barbarian.pendingAttack !== null
      ? "resolving-barbarian-attack"
      : "resolving-official-result";
  const candidate: GameState = {
    ...state,
    turn: { ...state.turn, phase },
    numberedDeck:
      alchemy === null && numberedDraw?.ok
        ? numberedDraw.value.deck
        : state.numberedDeck,
    eventDeck: eventDraw.value.deck,
    thematicEvents: thematic.value.state,
    barbarian,
    resolution: { official },
    lastRoll: record,
    statistics: {
      ...state.statistics,
      totalRolls: state.statistics.totalRolls + 1,
      normalRolls: state.statistics.normalRolls + (alchemy === null ? 1 : 0),
      alchemyRolls: state.statistics.alchemyRolls + (alchemy === null ? 0 : 1),
      numberedTotals: {
        ...state.statistics.numberedTotals,
        [String(total)]:
          (state.statistics.numberedTotals[String(total)] ?? 0) + 1,
      },
      eventFaces: {
        ...state.statistics.eventFaces,
        [eventDraw.value.value]:
          state.statistics.eventFaces[eventDraw.value.value] + 1,
      },
      thematicEventsTriggered:
        state.statistics.thematicEventsTriggered +
        (thematic.value.event === null ? 0 : 1),
    },
    history: {
      rolls: [...state.history.rolls, record],
      thematicEvents:
        thematic.value.event === null
          ? state.history.thematicEvents
          : [...state.history.thematicEvents, thematic.value.event],
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: alchemy === null ? "roll-drawn" : "alchemy-used",
      text:
        alchemy === null
          ? `Drew ${numbered.red} + ${numbered.yellow} and ${record.eventFace}.`
          : `Used Alchemy for ${numbered.red} + ${numbered.yellow}; drew ${record.eventFace}.`,
      playerIds: [record.playerId],
    },
    {
      type: "roll",
      roll: record,
      phase,
      barbarianAttack: barbarian.pendingAttack,
      thematicEventPending: thematic.value.event !== null,
    },
  );
}

function acknowledgeProgress(
  state: GameState,
  rollId: RollId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const official = state.resolution.official;
  if (
    state.turn.phase !== "resolving-official-result" ||
    official === null ||
    !official.progressPending
  ) {
    return failure(
      domainError(
        "INVALID_PHASE",
        "No progress resolution is awaiting acknowledgement.",
      ),
    );
  }
  if (official.rollId !== rollId) {
    return failure(domainError("STALE_ROLL", "Roll acknowledgement is stale."));
  }
  const nextOfficial = { ...official, progressPending: false };
  const candidate = {
    ...state,
    resolution: { official: nextOfficial },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "resolution-acknowledged",
      text: "Acknowledged progress-card eligibility.",
      playerIds: state.lastRoll?.progress?.eligiblePlayerIds ?? [],
    },
    {
      type: "resolution",
      phase: candidate.turn.phase,
      pendingProgress: false,
      pendingProduction: nextOfficial.productionPending,
    },
  );
}

function acknowledgeProduction(
  state: GameState,
  rollId: RollId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const official = state.resolution.official;
  if (
    state.turn.phase !== "resolving-official-result" ||
    official === null ||
    official.progressPending ||
    !official.productionPending
  ) {
    return failure(
      domainError(
        "INVALID_PHASE",
        "Production cannot be acknowledged before earlier official steps.",
      ),
    );
  }
  if (official.rollId !== rollId) {
    return failure(domainError("STALE_ROLL", "Roll acknowledgement is stale."));
  }
  const phase =
    state.thematicEvents.pendingEvent === null
      ? "action-phase"
      : "resolving-thematic-event";
  const candidate: GameState = {
    ...state,
    turn: { ...state.turn, phase },
    resolution: { official: null },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "resolution-acknowledged",
      text: "Acknowledged production or rolled-seven guidance.",
      playerIds: [currentPlayer(state).id],
    },
    {
      type: "resolution",
      phase,
      pendingProgress: false,
      pendingProduction: false,
    },
  );
}

function adjustPlayer(
  state: GameState,
  playerId: PlayerId,
  patch: PublicStatePatch,
  deps: DomainDeps,
): DomainResult<Decision> {
  const correctingAttack = state.turn.phase === "resolving-barbarian-attack";
  if (!correctingAttack && state.turn.phase !== "action-phase") {
    return failure(
      domainError(
        "INVALID_PHASE",
        "Public state can only be edited during the action phase or attack verification.",
        {
          actual: state.turn.phase,
        },
      ),
    );
  }
  if (state.metropolises.pendingProposal !== null) {
    return failure(
      domainError(
        "INVALID_PHASE",
        "Resolve the pending metropolis proposal before another public-state edit.",
      ),
    );
  }
  const playerIndex = state.players.findIndex(
    (player) => player.id === playerId,
  );
  const player = state.players[playerIndex];
  if (player === undefined) {
    return failure(
      domainError("INVALID_PLAYER_STATE", "Player does not exist.", {
        playerId,
      }),
    );
  }
  const updatedPlayer: PlayerState = {
    ...player,
    name: patch.name?.trim() ?? player.name,
    ordinaryCities: patch.ordinaryCities ?? player.ordinaryCities,
    activeKnights: mergeKnights(player.activeKnights, patch.activeKnights),
    improvements: mergeImprovements(player.improvements, patch.improvements),
  };
  const increasedImprovement = DISCIPLINES.some(
    (discipline) =>
      updatedPlayer.improvements[discipline] > player.improvements[discipline],
  );
  if (
    increasedImprovement &&
    updatedPlayer.ordinaryCities + metropolisCountForPlayer(state, playerId) ===
      0
  ) {
    return failure(
      domainError(
        "INVALID_PLAYER_STATE",
        "A player without a city cannot increase improvement levels.",
        { playerId },
      ),
    );
  }
  for (const discipline of DISCIPLINES) {
    const control = state.metropolises.controls[discipline];
    if (
      control?.holderId === playerId &&
      updatedPlayer.improvements[discipline] <
        (control.status === "permanent" ? 5 : 4)
    ) {
      return failure(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "Correct metropolis control before lowering its holder below the required level.",
          { playerId, discipline },
        ),
      );
    }
  }

  const players = state.players.map((candidate, index) =>
    index === playerIndex ? updatedPlayer : candidate,
  );
  let scoreLedger = state.scoreLedger;
  if (patch.scoreAdjustment !== undefined) {
    if (
      !Number.isInteger(patch.scoreAdjustment.delta) ||
      patch.scoreAdjustment.delta === 0
    ) {
      return failure(
        domainError(
          "INVALID_SCORE",
          "A score adjustment must be a non-zero integer.",
        ),
      );
    }
    scoreLedger = [
      ...scoreLedger,
      {
        id: nextScoreEntryId(deps.ids),
        playerId,
        delta: patch.scoreAdjustment.delta,
        reason: patch.scoreAdjustment.reason,
        ...(patch.scoreAdjustment.note === undefined
          ? {}
          : { note: patch.scoreAdjustment.note }),
        createdAt: deps.at,
      },
    ];
  }
  let candidate: GameState = { ...state, players, scoreLedger };
  if (correctingAttack) {
    candidate = {
      ...candidate,
      barbarian: {
        ...candidate.barbarian,
        pendingAttack: calculateBarbarianAttack(
          candidate,
          nextProposalId(deps.ids),
        ),
      },
    };
  } else {
    const automaticProposal = findAutomaticMetropolisProposal(
      state,
      candidate,
      playerId,
      deps,
    );
    if (!automaticProposal.ok) {
      return failure(automaticProposal.error);
    }
    if (automaticProposal.value !== null) {
      candidate = {
        ...candidate,
        metropolises: {
          ...candidate.metropolises,
          pendingProposal: automaticProposal.value,
        },
      };
    }
  }
  return commit(
    candidate,
    deps,
    {
      kind: "player-adjusted",
      text: `Adjusted public state for ${updatedPlayer.name}.`,
      playerIds: [playerId],
    },
    {
      type: "player-state",
      playerId,
      score: scoreForPlayer(candidate, playerId),
      metropolisProposal: candidate.metropolises.pendingProposal,
    },
  );
}

function findAutomaticMetropolisProposal(
  before: GameState,
  after: GameState,
  playerId: PlayerId,
  deps: DomainDeps,
): DomainResult<GameState["metropolises"]["pendingProposal"]> {
  const oldPlayer = before.players.find((player) => player.id === playerId);
  const newPlayer = after.players.find((player) => player.id === playerId);
  if (oldPlayer === undefined || newPlayer === undefined) {
    return success(null);
  }
  const targets: Array<{
    discipline: MetropolisDiscipline;
    to: MetropolisControl;
  }> = [];
  for (const discipline of DISCIPLINES) {
    const oldLevel = oldPlayer.improvements[discipline];
    const newLevel = newPlayer.improvements[discipline];
    const control = before.metropolises.controls[discipline];
    if (newLevel >= 5 && oldLevel < 5 && control?.status !== "permanent") {
      targets.push({
        discipline,
        to: { holderId: playerId, status: "permanent" },
      });
    } else if (newLevel >= 4 && oldLevel < 4 && control === null) {
      targets.push({
        discipline,
        to: {
          holderId: playerId,
          status: newLevel === 5 ? "permanent" : "temporary",
        },
      });
    }
  }
  if (targets.length > 1) {
    return failure(
      domainError(
        "INVALID_METROPOLIS_STATE",
        "One edit cannot open multiple metropolis proposals.",
      ),
    );
  }
  const target = targets[0];
  if (target === undefined) {
    return success(null);
  }
  return proposeMetropolisChange(
    after,
    nextProposalId(deps.ids),
    target.discipline,
    target.to,
    "improvement",
  );
}

function proposeMetropolis(
  state: GameState,
  discipline: MetropolisDiscipline,
  to: MetropolisControl,
  source: "improvement" | "correction",
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "action-phase");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  const proposal = proposeMetropolisChange(
    state,
    nextProposalId(deps.ids),
    discipline,
    to,
    source,
  );
  if (!proposal.ok) {
    return failure(proposal.error);
  }
  const candidate: GameState = {
    ...state,
    metropolises: {
      ...state.metropolises,
      pendingProposal: proposal.value,
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "metropolis-proposed",
      text: proposal.value.summary,
      playerIds: proposal.value.changes.map((change) => change.playerId),
    },
    {
      type: "metropolis",
      proposal: proposal.value,
      controls: candidate.metropolises.controls,
    },
  );
}

function proposeMetropolisCommand(
  state: GameState,
  discipline: MetropolisDiscipline,
  holderId: PlayerId | null,
  status: "temporary" | "permanent" | null,
  source: "improvement" | "correction",
  deps: DomainDeps,
): DomainResult<Decision> {
  const control = controlFromCommand(holderId, status);
  if (!control.ok) {
    return failure(control.error);
  }
  return proposeMetropolis(state, discipline, control.value, source, deps);
}

function confirmMetropolis(
  state: GameState,
  proposalId: ProposalId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "action-phase");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  const proposal = state.metropolises.pendingProposal;
  if (proposal === null || proposal.id !== proposalId) {
    return failure(
      domainError(
        "METROPOLIS_CONFIRMATION_STALE",
        "Metropolis proposal is missing or stale.",
      ),
    );
  }
  const players = state.players.map((player) => {
    const change = proposal.changes.find(
      (candidate) => candidate.playerId === player.id,
    );
    return change === undefined
      ? player
      : {
          ...player,
          ordinaryCities: player.ordinaryCities + change.ordinaryCityDelta,
        };
  });
  const scoreEntries: ScoreEntry[] = proposal.changes
    .filter((change) => change.scoreDelta !== 0)
    .map((change) => ({
      id: nextScoreEntryId(deps.ids),
      playerId: change.playerId,
      delta: change.scoreDelta,
      reason: "metropolis",
      note: proposal.summary,
      createdAt: deps.at,
    }));
  const controls = {
    ...state.metropolises.controls,
    [proposal.discipline]: proposal.to,
  };
  const candidate: GameState = {
    ...state,
    players,
    scoreLedger: [...state.scoreLedger, ...scoreEntries],
    metropolises: { controls, pendingProposal: null },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "metropolis-confirmed",
      text: proposal.summary,
      playerIds: proposal.changes.map((change) => change.playerId),
    },
    {
      type: "metropolis",
      proposal: null,
      controls,
    },
  );
}

function cancelMetropolis(
  state: GameState,
  proposalId: ProposalId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "action-phase");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  const proposal = state.metropolises.pendingProposal;
  if (proposal === null || proposal.id !== proposalId) {
    return failure(
      domainError(
        "METROPOLIS_CONFIRMATION_STALE",
        "Metropolis proposal is missing or stale.",
      ),
    );
  }
  const candidate: GameState = {
    ...state,
    metropolises: { ...state.metropolises, pendingProposal: null },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "metropolis-cancelled",
      text: `Cancelled: ${proposal.summary}`,
      playerIds: proposal.changes.map((change) => change.playerId),
    },
    {
      type: "metropolis",
      proposal: null,
      controls: candidate.metropolises.controls,
    },
  );
}

function confirmAttack(
  state: GameState,
  proposalId: ProposalId,
  progressChoices: Array<{
    playerId: PlayerId;
    discipline: ProgressDiscipline;
  }>,
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "resolving-barbarian-attack");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  const proposal = state.barbarian.pendingAttack;
  if (proposal === null || proposal.id !== proposalId) {
    return failure(
      domainError(
        "ATTACK_CONFIRMATION_STALE",
        "Barbarian attack proposal is missing or stale.",
      ),
    );
  }
  const choiceError = validateProgressChoices(
    proposal.outcome,
    progressChoices,
  );
  if (choiceError !== null) {
    return failure(choiceError);
  }

  let players = state.players.map((player) => ({
    ...player,
    activeKnights: { basic: 0, strong: 0, mighty: 0 },
  }));
  const scoreEntries: ScoreEntry[] = [];
  if (
    proposal.outcome.type === "defenders-win" &&
    proposal.outcome.reward.type === "defender-point"
  ) {
    scoreEntries.push({
      id: nextScoreEntryId(deps.ids),
      playerId: proposal.outcome.reward.playerId,
      delta: 1,
      reason: "defender",
      createdAt: deps.at,
    });
  }
  if (proposal.outcome.type === "barbarians-win") {
    players = players.map((player) =>
      proposal.outcome.type === "barbarians-win" &&
      proposal.outcome.pillagedPlayerIds.includes(player.id)
        ? { ...player, ordinaryCities: player.ordinaryCities - 1 }
        : player,
    );
  }
  const record: BarbarianAttackRecord = {
    proposalId,
    completedAt: deps.at,
    strengths: proposal.strengths,
    outcome: proposal.outcome,
    progressChoices,
  };
  const official = state.resolution.official;
  const phase =
    official !== null &&
    (official.progressPending || official.productionPending)
      ? "resolving-official-result"
      : state.thematicEvents.pendingEvent === null
        ? "action-phase"
        : "resolving-thematic-event";
  const candidate: GameState = {
    ...state,
    players,
    scoreLedger: [...state.scoreLedger, ...scoreEntries],
    turn: { ...state.turn, phase },
    barbarian: {
      ...state.barbarian,
      shipPosition: 0,
      robberActivated: true,
      attacksCompleted: state.barbarian.attacksCompleted + 1,
      pendingAttack: null,
      history: [...state.barbarian.history, record],
    },
    statistics: {
      ...state.statistics,
      barbarianAttacksWon:
        state.statistics.barbarianAttacksWon +
        (proposal.outcome.type === "defenders-win" ? 1 : 0),
      barbarianAttacksLost:
        state.statistics.barbarianAttacksLost +
        (proposal.outcome.type === "barbarians-win" ? 1 : 0),
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "attack-confirmed",
      text: proposal.summary,
      playerIds:
        proposal.outcome.type === "barbarians-win"
          ? proposal.outcome.pillagedPlayerIds
          : proposal.outcome.reward.type === "defender-point"
            ? [proposal.outcome.reward.playerId]
            : proposal.outcome.reward.playerIds,
    },
    { type: "barbarian-attack", record, phase },
  );
}

function acknowledgeThematicEvent(
  state: GameState,
  occurrenceId: EventOccurrenceId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "resolving-thematic-event");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  const pending = state.thematicEvents.pendingEvent;
  if (pending === null || pending.occurrenceId !== occurrenceId) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "Thematic event acknowledgement is stale.",
      ),
    );
  }
  const acknowledged = { ...pending, acknowledged: true };
  const candidate: GameState = {
    ...state,
    turn: { ...state.turn, phase: "action-phase" },
    thematicEvents: {
      ...state.thematicEvents,
      pendingEvent: null,
    },
    history: {
      ...state.history,
      thematicEvents: state.history.thematicEvents.map((event) =>
        event.occurrenceId === occurrenceId ? acknowledged : event,
      ),
    },
  };
  return commit(
    candidate,
    deps,
    {
      kind: "thematic-event-acknowledged",
      text: `Acknowledged ${pending.title}.`,
      playerIds: [currentPlayer(state).id],
    },
    {
      type: "thematic-event",
      event: acknowledged,
      phase: "action-phase",
    },
  );
}

function endTurn(state: GameState, deps: DomainDeps): DomainResult<Decision> {
  const phaseError = requirePhase(state, "action-phase");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  if (state.metropolises.pendingProposal !== null) {
    return failure(
      domainError(
        "INVALID_PHASE",
        "Confirm or cancel the pending metropolis proposal before ending the turn.",
      ),
    );
  }
  const completedTurns = state.turn.completedTurns + 1;
  const nextPlayerIndex =
    (state.turn.currentPlayerIndex + 1) % state.players.length;
  const completedRound = completedTurns % state.players.length === 0;
  const candidate: GameState = {
    ...state,
    turn: {
      phase: "awaiting-roll",
      currentPlayerIndex: nextPlayerIndex,
      completedTurns,
      round: state.turn.round + (completedRound ? 1 : 0),
      turnNumber: state.turn.turnNumber + 1,
    },
    ...(state.clock === undefined
      ? {}
      : {
          clock: {
            ...state.clock,
            currentTurnActiveMs: 0,
            runningSince: deps.at,
            pausedAt: null,
          },
        }),
    statistics: {
      ...state.statistics,
      completedTurns,
      completedRounds: Math.floor(completedTurns / state.players.length),
    },
  };
  const candidates = winnerCandidates(candidate);
  return commit(
    candidate,
    deps,
    {
      kind: "turn-ended",
      text: `Ended the turn; ${currentPlayer(candidate).name} is next.`,
      playerIds: [currentPlayer(candidate).id],
    },
    {
      type: "turn",
      currentPlayerId: currentPlayer(candidate).id,
      round: candidate.turn.round,
      turnNumber: candidate.turn.turnNumber,
      winnerCandidateIds: candidates,
    },
  );
}

function completeGame(
  state: GameState,
  winnerId: PlayerId,
  deps: DomainDeps,
): DomainResult<Decision> {
  const phaseError = requirePhase(state, "action-phase");
  if (phaseError !== null) {
    return failure(phaseError);
  }
  if (!winnerCandidates(state).includes(winnerId)) {
    return failure(
      domainError(
        "WINNER_NOT_ELIGIBLE",
        "The confirmed winner has not reached the public victory target.",
        { winnerId },
      ),
    );
  }
  const candidate: GameState = {
    ...state,
    status: "completed",
    winnerId,
    turn: { ...state.turn, phase: "completed" },
    ...(state.clock === undefined
      ? {}
      : {
          clock: {
            ...state.clock,
            runningSince: null,
            pausedAt: null,
          },
        }),
  };
  return commit(
    candidate,
    deps,
    {
      kind: "game-completed",
      text: `Confirmed ${state.players.find((player) => player.id === winnerId)?.name ?? "the winner"}.`,
      playerIds: [winnerId],
    },
    { type: "game-completed", winnerId },
  );
}

function commit(
  candidate: GameState,
  deps: DomainDeps,
  summary: Decision["summary"],
  presentation: Decision["presentation"],
): DomainResult<Decision> {
  const nextState: GameState = {
    ...candidate,
    revisionId: deps.revisionId,
    revisionNumber: candidate.revisionNumber + 1,
    updatedAt: deps.at,
  };
  const errors = validateGameState(nextState);
  if (errors.length > 0) {
    return failure(
      errors[0] ??
        domainError("INVARIANT_VIOLATION", "Command produced invalid state."),
    );
  }
  return success({ nextState, summary, presentation });
}

function requirePhase(state: GameState, expected: GameState["turn"]["phase"]) {
  return state.turn.phase === expected
    ? null
    : domainError("INVALID_PHASE", `Command requires ${expected}.`, {
        expected,
        actual: state.turn.phase,
      });
}

function controlFromCommand(
  holderId: PlayerId | null,
  status: "temporary" | "permanent" | null,
): DomainResult<MetropolisControl> {
  if ((holderId === null) !== (status === null)) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "Metropolis holder and status must either both be present or both be null.",
      ),
    );
  }
  return success(
    holderId === null || status === null ? null : { holderId, status },
  );
}

function validateProgressChoices(
  outcome: BarbarianAttackOutcome,
  choices: Array<{ playerId: PlayerId; discipline: ProgressDiscipline }>,
) {
  if (
    outcome.type === "defenders-win" &&
    outcome.reward.type === "progress-choice"
  ) {
    const required = outcome.reward.playerIds;
    if (
      choices.length !== required.length ||
      new Set(choices.map((choice) => choice.playerId)).size !==
        choices.length ||
      required.some(
        (playerId) => !choices.some((choice) => choice.playerId === playerId),
      )
    ) {
      return domainError(
        "INVALID_COMMAND",
        "Every tied top contributor must choose exactly one progress deck.",
      );
    }
    return null;
  }
  return choices.length === 0
    ? null
    : domainError(
        "INVALID_COMMAND",
        "This attack outcome has no progress-deck choices.",
      );
}

function mergeKnights(
  current: KnightCounts,
  patch: Partial<KnightCounts> | undefined,
): KnightCounts {
  return {
    basic: patch?.basic ?? current.basic,
    strong: patch?.strong ?? current.strong,
    mighty: patch?.mighty ?? current.mighty,
  };
}

function mergeImprovements(
  current: ImprovementLevels,
  patch: Partial<ImprovementLevels> | undefined,
): ImprovementLevels {
  return {
    science: patch?.science ?? current.science,
    trade: patch?.trade ?? current.trade,
    politics: patch?.politics ?? current.politics,
  };
}

function cloneSetup(setup: CreateGameInput["setup"]): CreateGameInput["setup"] {
  return {
    ...setup,
    players: setup.players.map((player) => ({
      ...player,
      color: { ...player.color },
      ...(player.activeKnights === undefined
        ? {}
        : { activeKnights: { ...player.activeKnights } }),
      ...(player.improvements === undefined
        ? {}
        : { improvements: { ...player.improvements } }),
    })),
    thematicEventCatalog: setup.thematicEventCatalog.map((event) => ({
      ...event,
    })),
  };
}

function isDieValue(value: number): value is DieValue {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function nextRollId(ids: DomainDeps["ids"]): RollId {
  return ids.next("roll") as RollId;
}

function nextEventOccurrenceId(ids: DomainDeps["ids"]): EventOccurrenceId {
  return ids.next("event-occurrence") as EventOccurrenceId;
}

function nextProposalId(ids: DomainDeps["ids"]): ProposalId {
  return ids.next("proposal") as ProposalId;
}

function nextScoreEntryId(ids: DomainDeps["ids"]): ScoreEntryId {
  return ids.next("score-entry") as ScoreEntryId;
}

function exhaustiveCommand(command: never): DomainResult<Decision> {
  return failure(
    domainError("INVALID_COMMAND", "Unsupported command.", {
      command: String(command),
    }),
  );
}
