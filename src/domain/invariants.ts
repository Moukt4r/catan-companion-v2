import { createCanonicalNumberedDeck } from "./decks";
import { parseIsoTimestamp } from "./clock";
import { domainError } from "./errors";
import {
  DISCIPLINES,
  EVENT_DECK_FACES,
  THEMATIC_TRIGGER_BAG_SIZE,
} from "./rules";
import { metropolisCountForPlayer, scoreForPlayer } from "./selectors";
import type {
  DeckState,
  DomainError,
  EventFace,
  GameSetup,
  GameState,
  MetropolisDiscipline,
  NumberedOutcome,
  PlayerId,
  PlayerState,
  ThematicEventDefinition,
  TriggerToken,
} from "./types";

export function validateSetup(setup: GameSetup): DomainError[] {
  const errors: DomainError[] = [];
  const playerCount = setup.players.length;
  if (
    (setup.mode === "standard" && (playerCount < 3 || playerCount > 4)) ||
    (setup.mode === "two-player-house-rule" && playerCount !== 2)
  ) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "Player count does not match the selected game mode.",
        { playerCount, mode: setup.mode },
      ),
    );
  }
  const ids = setup.players.map((player) => player.id);
  if (!allUnique(ids) || ids.some((id) => id.trim() === "")) {
    errors.push(
      domainError("INVALID_SETUP", "Player IDs must be non-empty and unique."),
    );
  }
  const names = setup.players.map((player) =>
    player.name.trim().toLocaleLowerCase(),
  );
  if (names.some((name) => name === "") || !allUnique(names)) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "Player names must be non-empty and unique ignoring case.",
      ),
    );
  }
  const colorIds = setup.players.map((player) =>
    player.color.id.trim().toLocaleLowerCase(),
  );
  const colorLabels = setup.players.map((player) =>
    player.color.label.trim().toLocaleLowerCase(),
  );
  const colorKeys = setup.players.map((player) =>
    player.color.distinguishabilityKey.trim().toLocaleLowerCase(),
  );
  if (
    colorIds.some((value) => value === "") ||
    colorLabels.some((value) => value === "") ||
    colorKeys.some((value) => value === "") ||
    !allUnique(colorIds) ||
    !allUnique(colorLabels) ||
    !allUnique(colorKeys) ||
    setup.players.some((player) => !/^#[0-9a-f]{6}$/i.test(player.color.hex))
  ) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "Player colors require unique labels and distinguishability keys plus six-digit hex values.",
      ),
    );
  }
  if (!ids.includes(setup.firstPlayerId)) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "The first player must reference a configured player.",
      ),
    );
  }
  if (
    !Number.isInteger(setup.victoryTarget) ||
    setup.victoryTarget < 1 ||
    setup.victoryTarget > 99
  ) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "Victory target must be an integer from 1 through 99.",
      ),
    );
  }
  if (setup.title.trim() === "") {
    errors.push(domainError("INVALID_SETUP", "Game title cannot be empty."));
  }
  if (
    !Number.isInteger(setup.gameDocumentVersion) ||
    setup.gameDocumentVersion < 1 ||
    setup.rulesDataVersion.trim() === ""
  ) {
    errors.push(
      domainError(
        "INVALID_SETUP",
        "Document and rules-data versions must be present.",
      ),
    );
  }
  errors.push(
    ...validateEventDefinitions(
      setup.thematicEventCatalog,
      setup.thematicEventsEnabled,
    ),
  );
  return errors;
}

export function validateGameState(state: GameState): DomainError[] {
  const errors = validateSetup(state.setup);
  if (state.id.trim() === "" || state.revisionId.trim() === "") {
    errors.push(
      domainError(
        "INVARIANT_VIOLATION",
        "Game and revision IDs cannot be empty.",
      ),
    );
  }
  if (!Number.isInteger(state.revisionNumber) || state.revisionNumber < 1) {
    errors.push(
      domainError(
        "INVARIANT_VIOLATION",
        "Revision number must be a positive integer.",
      ),
    );
  }
  errors.push(...validatePlayers(state));
  errors.push(...validateMetropolises(state));
  errors.push(...validateScoreLedger(state));
  errors.push(...validateDecks(state));
  errors.push(...validateThematicState(state));
  errors.push(...validateBarbarianState(state));
  errors.push(...validateResolutionState(state));
  errors.push(...validateTurnAndStatus(state));
  errors.push(...validateClockState(state));
  return errors;
}

function validatePlayers(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  const setupIds = state.setup.players.map((player) => player.id);
  const stateIds = state.players.map((player) => player.id);
  if (
    state.players.length !== state.setup.players.length ||
    setupIds.some((id) => !stateIds.includes(id)) ||
    !allUnique(stateIds)
  ) {
    errors.push(
      domainError(
        "INVALID_PLAYER_STATE",
        "Players must match the immutable setup identities.",
      ),
    );
  }
  const names = state.players.map((player) =>
    player.name.trim().toLocaleLowerCase(),
  );
  if (!allUnique(names) || names.some((name) => name === "")) {
    errors.push(
      domainError(
        "INVALID_PLAYER_STATE",
        "Player names must remain non-empty and unique.",
      ),
    );
  }
  for (const [index, player] of state.players.entries()) {
    if (player.order !== index) {
      errors.push(
        domainError(
          "INVALID_PLAYER_STATE",
          "Player order must be contiguous and match array order.",
          { playerId: player.id, order: player.order },
        ),
      );
    }
    errors.push(...validatePlayerCounters(player, state));
  }
  return errors;
}

function validatePlayerCounters(
  player: PlayerState,
  state: GameState,
): DomainError[] {
  const errors: DomainError[] = [];
  if (!nonNegativeInteger(player.ordinaryCities)) {
    errors.push(
      domainError(
        "INVALID_PLAYER_STATE",
        "Ordinary cities must be a non-negative integer.",
        { playerId: player.id },
      ),
    );
  }
  for (const [level, count] of [
    ["basic", player.activeKnights.basic],
    ["strong", player.activeKnights.strong],
    ["mighty", player.activeKnights.mighty],
  ] as const) {
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > state.barbarian.rules.knightComponentLimitPerLevel
    ) {
      errors.push(
        domainError(
          "INVALID_PLAYER_STATE",
          "Active knight count exceeds the component limit.",
          { playerId: player.id, level, count },
        ),
      );
    }
  }
  for (const [discipline, level] of [
    ["science", player.improvements.science],
    ["trade", player.improvements.trade],
    ["politics", player.improvements.politics],
  ] as const) {
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      errors.push(
        domainError(
          "INVALID_PLAYER_STATE",
          "Improvement levels must be integers from 0 through 5.",
          { playerId: player.id, discipline, level },
        ),
      );
    }
  }
  return errors;
}

function validateMetropolises(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  for (const discipline of DISCIPLINES) {
    const control = state.metropolises.controls[discipline];
    if (control === null) {
      continue;
    }
    const player = state.players.find(
      (candidate) => candidate.id === control.holderId,
    );
    if (player === undefined) {
      errors.push(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "Metropolis holder is not a player.",
          { discipline, holderId: control.holderId },
        ),
      );
      continue;
    }
    const minimum = control.status === "permanent" ? 5 : 4;
    if (player.improvements[discipline] < minimum) {
      errors.push(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "Metropolis holder lacks the required improvement level.",
          { discipline, holderId: control.holderId, minimum },
        ),
      );
    }
  }
  if (state.metropolises.pendingProposal !== null) {
    const proposal = state.metropolises.pendingProposal;
    if (
      state.metropolises.controls[proposal.discipline]?.holderId !==
        proposal.from?.holderId ||
      state.metropolises.controls[proposal.discipline]?.status !==
        proposal.from?.status
    ) {
      errors.push(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "Pending proposal no longer matches metropolis control.",
        ),
      );
    }
  }
  for (const player of state.players) {
    if (
      player.ordinaryCities + metropolisCountForPlayer(state, player.id) <
      0
    ) {
      errors.push(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "Recorded city-piece count cannot be negative.",
          { playerId: player.id },
        ),
      );
    }
  }
  return errors;
}

function validateScoreLedger(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  if (!allUnique(state.scoreLedger.map((entry) => entry.id))) {
    errors.push(
      domainError("INVALID_SCORE", "Score ledger IDs must be unique."),
    );
  }
  for (const entry of state.scoreLedger) {
    if (
      !state.players.some((player) => player.id === entry.playerId) ||
      !Number.isInteger(entry.delta) ||
      entry.delta === 0
    ) {
      errors.push(
        domainError(
          "INVALID_SCORE",
          "Score entries require an existing player and a non-zero integer delta.",
          { entryId: entry.id },
        ),
      );
    }
  }
  for (const player of state.players) {
    const score = scoreForPlayer(state, player.id);
    if (!nonNegativeInteger(score)) {
      errors.push(
        domainError(
          "INVALID_SCORE",
          "A player public score cannot be negative.",
          { playerId: player.id, score },
        ),
      );
    }
  }
  return errors;
}

function validateDecks(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  errors.push(
    ...validateDeckState(state.numberedDeck, 36, "numbered"),
    ...validateDeckState(state.eventDeck, 6, "event"),
  );
  const expectedPairs = createCanonicalNumberedDeck().map(pairKey).sort();
  const actualPairs = state.numberedDeck.order.map(pairKey).sort();
  if (expectedPairs.join("|") !== actualPairs.join("|")) {
    errors.push(
      domainError(
        "INVALID_DECK_STATE",
        "Numbered deck must contain every ordered pair exactly once.",
      ),
    );
  }
  const expectedFaces = [...EVENT_DECK_FACES].sort();
  const actualFaces = [...state.eventDeck.order].sort();
  if (expectedFaces.join("|") !== actualFaces.join("|")) {
    errors.push(
      domainError(
        "INVALID_DECK_STATE",
        "Event deck must contain the 3/1/1/1 face distribution.",
      ),
    );
  }
  return errors;
}

function validateDeckState<T>(
  deck: DeckState<T>,
  expectedLength: number,
  kind: string,
): DomainError[] {
  return !Number.isInteger(deck.cycle) ||
    deck.cycle < 1 ||
    !Number.isInteger(deck.cursor) ||
    deck.cursor < 0 ||
    deck.cursor > expectedLength ||
    deck.order.length !== expectedLength ||
    deck.createdAtRevision.trim() === ""
    ? [
        domainError("INVALID_DECK_STATE", "Deck metadata is invalid.", {
          kind,
          cycle: deck.cycle,
          cursor: deck.cursor,
          length: deck.order.length,
        }),
      ]
    : [];
}

function validateThematicState(state: GameState): DomainError[] {
  const thematic = state.thematicEvents;
  const errors = validateEventDefinitions(
    thematic.enabledEvents,
    thematic.enabled,
  );
  const bagSize = THEMATIC_TRIGGER_BAG_SIZE[thematic.cadence];
  errors.push(...validateDeckState(thematic.triggerBag, bagSize, "trigger"));
  if (thematic.triggerBag.order.filter((token) => token.trigger).length !== 1) {
    errors.push(
      domainError(
        "INVALID_THEMATIC_STATE",
        "Trigger bag must contain exactly one trigger.",
      ),
    );
  }
  errors.push(
    ...validateThematicEventDeck(thematic.eventDeck, thematic.enabledEvents),
  );
  if (
    thematic.pendingEvent !== null &&
    !thematic.enabledEvents.some(
      (event) => event.id === thematic.pendingEvent?.eventId,
    )
  ) {
    errors.push(
      domainError(
        "INVALID_THEMATIC_STATE",
        "Pending thematic event is not enabled.",
      ),
    );
  }
  return errors;
}

function validateThematicEventDeck(
  deck: DeckState<string>,
  events: ThematicEventDefinition[],
): DomainError[] {
  if (events.length === 0) {
    return deck.order.length === 0 && deck.cursor === 0
      ? []
      : [
          domainError(
            "INVALID_THEMATIC_STATE",
            "Disabled empty event catalog must have an empty event deck.",
          ),
        ];
  }
  const metadata = validateDeckState(deck, events.length, "thematic-event");
  const expected = events.map((event) => event.id).sort();
  const actual = [...deck.order].sort();
  if (expected.join("|") !== actual.join("|")) {
    metadata.push(
      domainError(
        "INVALID_THEMATIC_STATE",
        "Thematic event deck must contain every enabled event exactly once.",
      ),
    );
  }
  return metadata;
}

function validateBarbarianState(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  const { barbarian } = state;
  if (
    !Number.isInteger(barbarian.rules.trackLength) ||
    barbarian.rules.trackLength < 1 ||
    !Number.isInteger(barbarian.rules.knightComponentLimitPerLevel) ||
    barbarian.rules.knightComponentLimitPerLevel < 1 ||
    !Number.isInteger(barbarian.shipPosition) ||
    barbarian.shipPosition < 0 ||
    barbarian.shipPosition > barbarian.rules.trackLength ||
    !nonNegativeInteger(barbarian.attacksCompleted)
  ) {
    errors.push(
      domainError(
        "INVALID_BARBARIAN_STATE",
        "Barbarian track metadata is invalid.",
      ),
    );
  }
  if (
    barbarian.pendingAttack !== null &&
    barbarian.shipPosition !== barbarian.rules.trackLength
  ) {
    errors.push(
      domainError(
        "INVALID_BARBARIAN_STATE",
        "A pending attack requires the ship at the final space.",
      ),
    );
  }
  return errors;
}

function validateResolutionState(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  const official = state.resolution.official;
  if (official !== null && state.lastRoll?.id !== official.rollId) {
    errors.push(
      domainError(
        "INVALID_RESOLUTION_STATE",
        "Official resolution must reference the last roll.",
      ),
    );
  }
  if (
    state.turn.phase === "resolving-official-result" &&
    (official === null ||
      (!official.progressPending && !official.productionPending))
  ) {
    errors.push(
      domainError(
        "INVALID_RESOLUTION_STATE",
        "Official resolution phase requires a pending official step.",
      ),
    );
  }
  if (
    state.turn.phase === "resolving-barbarian-attack" &&
    state.barbarian.pendingAttack === null
  ) {
    errors.push(
      domainError(
        "INVALID_RESOLUTION_STATE",
        "Barbarian phase requires a pending attack.",
      ),
    );
  }
  if (
    state.turn.phase === "resolving-thematic-event" &&
    state.thematicEvents.pendingEvent === null
  ) {
    errors.push(
      domainError(
        "INVALID_RESOLUTION_STATE",
        "Thematic phase requires a pending event.",
      ),
    );
  }
  return errors;
}

function validateTurnAndStatus(state: GameState): DomainError[] {
  const errors: DomainError[] = [];
  if (
    !Number.isInteger(state.turn.currentPlayerIndex) ||
    state.turn.currentPlayerIndex < 0 ||
    state.turn.currentPlayerIndex >= state.players.length ||
    !Number.isInteger(state.turn.round) ||
    state.turn.round < 1 ||
    !Number.isInteger(state.turn.turnNumber) ||
    state.turn.turnNumber < 1 ||
    !nonNegativeInteger(state.turn.completedTurns)
  ) {
    errors.push(
      domainError("INVARIANT_VIOLATION", "Turn metadata is invalid."),
    );
  }
  if (
    (state.status === "completed") !== (state.turn.phase === "completed") ||
    (state.status === "completed") !== (state.winnerId !== null)
  ) {
    errors.push(
      domainError(
        "INVARIANT_VIOLATION",
        "Completed status, phase, and winner must agree.",
      ),
    );
  }
  if (
    state.winnerId !== null &&
    !state.players.some((player) => player.id === state.winnerId)
  ) {
    errors.push(
      domainError(
        "INVARIANT_VIOLATION",
        "Winner must reference an existing player.",
      ),
    );
  }
  return errors;
}

function validateClockState(state: GameState): DomainError[] {
  const clock = state.clock;
  if (clock === undefined) {
    return [];
  }
  const errors: DomainError[] = [];
  if (
    !nonNegativeInteger(clock.totalActiveMs) ||
    !nonNegativeInteger(clock.currentTurnActiveMs) ||
    Object.values(clock.playerActiveMs).some(
      (duration) => !nonNegativeInteger(duration),
    )
  ) {
    errors.push(
      domainError(
        "INVALID_CLOCK_STATE",
        "Clock durations must be non-negative integers.",
      ),
    );
  }
  const playerIds = [...state.players.map((player) => player.id)].sort();
  const accumulatorIds = Object.keys(clock.playerActiveMs).sort();
  if (
    playerIds.length !== accumulatorIds.length ||
    playerIds.some((playerId, index) => playerId !== accumulatorIds[index])
  ) {
    errors.push(
      domainError(
        "INVALID_CLOCK_STATE",
        "Clock player accumulators must exactly match the game players.",
      ),
    );
  }
  const runningValid =
    clock.runningSince === null ||
    parseIsoTimestamp(clock.runningSince) !== null;
  const pausedValid =
    clock.pausedAt === null || parseIsoTimestamp(clock.pausedAt) !== null;
  const running = clock.runningSince !== null;
  const paused = clock.pausedAt !== null;
  if (
    !runningValid ||
    !pausedValid ||
    (state.status === "active" && running === paused) ||
    (state.status === "completed" && (running || paused))
  ) {
    errors.push(
      domainError(
        "INVALID_CLOCK_STATE",
        "Clock timestamps do not match the game clock status.",
      ),
    );
  }
  return errors;
}

function validateEventDefinitions(
  events: readonly ThematicEventDefinition[],
  required: boolean,
): DomainError[] {
  if (required && events.length === 0) {
    return [
      domainError(
        "INVALID_SETUP",
        "Enabled thematic events require at least one event definition.",
      ),
    ];
  }
  if (
    !allUnique(events.map((event) => event.id)) ||
    events.some(
      (event) =>
        event.id.trim() === "" ||
        event.title.trim() === "" ||
        event.instruction.trim() === "" ||
        !Number.isInteger(event.contentVersion) ||
        event.contentVersion < 1,
    )
  ) {
    return [
      domainError(
        "INVALID_SETUP",
        "Thematic event definitions require unique IDs and versioned content.",
      ),
    ];
  }
  return [];
}

function pairKey(outcome: NumberedOutcome): string {
  return `${outcome.red}-${outcome.yellow}`;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function allUnique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

export function referencesPlayer(
  playerIds: readonly PlayerId[],
  playerId: PlayerId,
): boolean {
  return playerIds.includes(playerId);
}

export function isEventFace(value: string): value is EventFace {
  return EVENT_DECK_FACES.includes(value as EventFace);
}

export function isTriggerToken(value: unknown): value is TriggerToken {
  return (
    typeof value === "object" &&
    value !== null &&
    "trigger" in value &&
    typeof value.trigger === "boolean"
  );
}

export function isDiscipline(value: string): value is MetropolisDiscipline {
  return DISCIPLINES.includes(value as MetropolisDiscipline);
}
