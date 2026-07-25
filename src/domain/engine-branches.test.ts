import { describe, expect, it } from "vitest";
import {
  asEventId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asProposalId,
  asRevisionId,
  asRollId,
  createGame,
  decide,
} from "./index";
import type {
  DomainDeps,
  DomainResult,
  GameCommand,
  GameSetup,
  GameState,
  IdSource,
  ThematicEventSnapshot,
} from "./types";

const PLAYER_IDS = [
  asPlayerId("player-a"),
  asPlayerId("player-b"),
  asPlayerId("player-c"),
];

function idSource(prefix: string): IdSource {
  let value = 0;
  return {
    next(kind) {
      value += 1;
      return `${prefix}-${kind}-${value}`;
    },
  };
}

function deps(prefix: string): DomainDeps {
  return {
    at: asIsoTimestamp("2026-07-12T12:00:00Z"),
    revisionId: asRevisionId(`revision-${prefix}`),
    random: () => 0,
    ids: idSource(prefix),
  };
}

function setup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    title: "Engine branches",
    mode: "standard",
    players: PLAYER_IDS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `color-${index}`,
        label: `Color ${index}`,
        hex: "#123456",
        distinguishabilityKey: `key-${index}`,
      },
    })),
    firstPlayerId: PLAYER_IDS[0]!,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: true,
    thematicEventCatalog: [
      {
        id: asEventId("event-one"),
        contentVersion: 1,
        title: "One",
        instruction: "Do one.",
      },
      {
        id: asEventId("event-two"),
        contentVersion: 1,
        title: "Two",
        instruction: "Do two.",
      },
    ],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
    ...overrides,
  };
}

function newGame(
  options: {
    setup?: GameSetup;
    trackLength?: number;
    componentLimit?: number;
  } = {},
): GameState {
  const result = createGame({
    gameId: asGameId("game"),
    revisionId: asRevisionId("revision-create"),
    createdAt: asIsoTimestamp("2026-07-12T10:00:00Z"),
    setup: options.setup ?? setup(),
    random: () => 0,
    ids: idSource("create"),
    barbarianRules: {
      ...(options.trackLength === undefined
        ? {}
        : { trackLength: options.trackLength }),
      ...(options.componentLimit === undefined
        ? {}
        : { knightComponentLimitPerLevel: options.componentLimit }),
    },
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.nextState;
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function run(
  state: GameState,
  command: GameCommand,
  prefix: string,
): GameState {
  return unwrap(decide(state, command, deps(prefix))).nextState;
}

function actionPhase(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: "action-phase" },
    resolution: { official: null },
  };
}

function forceEventFace(
  state: GameState,
  face: GameState["eventDeck"]["order"][number],
): GameState {
  const order = [...state.eventDeck.order];
  const source = order.indexOf(face);
  const current = order[state.eventDeck.cursor]!;
  order[state.eventDeck.cursor] = face;
  order[source] = current;
  return { ...state, eventDeck: { ...state.eventDeck, order } };
}

function expectError(
  state: GameState,
  command: GameCommand,
  code: string,
  prefix: string,
): void {
  expect(decide(state, command, deps(prefix))).toMatchObject({
    ok: false,
    error: { code },
  });
}

function pendingEvent(state: GameState): ThematicEventSnapshot {
  const definition = state.thematicEvents.enabledEvents[0]!;
  return {
    occurrenceId: "occurrence" as never,
    eventId: definition.id,
    contentVersion: definition.contentVersion,
    title: definition.title,
    instruction: definition.instruction,
    triggeredAtCompletedTurn: 3,
    acknowledged: false,
  };
}

describe("game creation branches", () => {
  it("rejects invalid setup and invalid barbarian overrides", () => {
    const invalidSetup = createGame({
      gameId: asGameId("invalid"),
      revisionId: asRevisionId("invalid"),
      createdAt: asIsoTimestamp("2026-07-12T10:00:00Z"),
      setup: setup({ title: " " }),
      random: () => 0,
      ids: idSource("invalid"),
    });
    expect(invalidSetup).toMatchObject({
      ok: false,
      error: { code: "INVALID_SETUP" },
    });

    const invalidRules = createGame({
      gameId: asGameId("invalid-rules"),
      revisionId: asRevisionId("invalid-rules"),
      createdAt: asIsoTimestamp("2026-07-12T10:00:00Z"),
      setup: setup(),
      random: () => 0,
      ids: idSource("invalid-rules"),
      barbarianRules: { trackLength: 0 },
    });
    expect(invalidRules).toMatchObject({
      ok: false,
      error: { code: "INVALID_BARBARIAN_STATE" },
    });
  });

  it("supports zero initial score, optional counters, and every house-rule label", () => {
    const twoPlayers = setup({
      mode: "two-player-house-rule",
      players: setup()
        .players.slice(0, 2)
        .map((player, index) => ({
          ...player,
          ...(index === 0
            ? {
                initialScore: 0,
                ordinaryCities: 2,
                activeKnights: { basic: 1 },
                improvements: { science: 1 as const },
              }
            : {}),
        })),
      victoryTarget: 10,
      thematicEventPercent: 8,
      numberedReshuffleThreshold: 0,
      thematicEventsEnabled: false,
      thematicEventCatalog: [],
    });
    const result = unwrap(
      createGame({
        gameId: asGameId("two-player"),
        revisionId: asRevisionId("two-player"),
        createdAt: asIsoTimestamp("2026-07-12T10:00:00Z"),
        setup: twoPlayers,
        random: () => 0,
        ids: idSource("two-player"),
        barbarianRules: { knightComponentLimitPerLevel: 3 },
      }),
    );
    expect(result.nextState.scoreLedger).toHaveLength(1);
    expect(result.nextState.players[0]).toMatchObject({
      ordinaryCities: 2,
      activeKnights: { basic: 1, strong: 0, mighty: 0 },
      improvements: { science: 1, trade: 0, politics: 0 },
    });
    expect(result.presentation).toMatchObject({
      houseRules: [
        "Balanced numbered deck",
        "Balanced event deck",
        "Two-player mode",
        "Custom victory target",
      ],
    });
  });
});

describe("command gatekeeping and roll branches", () => {
  it("rejects corrupt, completed, and unsupported commands", () => {
    const corrupt = newGame();
    corrupt.revisionNumber = 0;
    expectError(
      corrupt,
      { type: "roll.draw" },
      "INVARIANT_VIOLATION",
      "corrupt",
    );

    let completed = actionPhase(
      newGame({ setup: setup({ victoryTarget: 3 }) }),
    );
    completed = run(
      completed,
      { type: "game.completed", winnerId: PLAYER_IDS[0]! },
      "complete",
    );
    expectError(completed, { type: "roll.draw" }, "NO_ACTIVE_GAME", "after");

    expect(
      decide(newGame(), { type: "unsupported" } as never, deps("unsupported")),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("rejects rolls outside the roll phase and invalid Alchemy values", () => {
    expectError(
      actionPhase(newGame()),
      { type: "roll.draw" },
      "INVALID_PHASE",
      "roll-phase",
    );
    for (const [red, yellow] of [
      [0, 1],
      [1, 7],
      [1.5, 2],
    ]) {
      expectError(
        newGame(),
        { type: "roll.alchemy", red, yellow } as never,
        "INVALID_COMMAND",
        `alchemy-${red}-${yellow}`,
      );
    }
  });

  it("covers production, seven reminders, barbarian movement, and thematic triggering", () => {
    let production = forceEventFace(newGame(), "science");
    production = run(
      production,
      { type: "roll.alchemy", red: 2, yellow: 3 },
      "production",
    );
    expect(production.lastRoll?.production).toEqual({
      type: "production",
      total: 5,
    });

    let seven = forceEventFace(newGame(), "science");
    seven = run(
      seven,
      { type: "roll.alchemy", red: 3, yellow: 4 },
      "seven-inactive",
    );
    expect(seven.lastRoll?.production).toMatchObject({
      type: "seven",
      reminder: "robber-not-yet-active",
    });

    let activeRobber = forceEventFace(newGame(), "science");
    activeRobber.barbarian.robberActivated = true;
    activeRobber = run(
      activeRobber,
      { type: "roll.alchemy", red: 3, yellow: 4 },
      "seven-active",
    );
    expect(activeRobber.lastRoll?.production).toMatchObject({
      type: "seven",
      reminder: "discard-and-move-robber",
    });

    let movement = forceEventFace(newGame({ trackLength: 2 }), "barbarian");
    movement = run(movement, { type: "roll.draw" }, "move");
    expect(movement.barbarian).toMatchObject({
      shipPosition: 1,
      pendingAttack: null,
    });

    let thematic = forceEventFace(newGame(), "science");
    thematic.turn.completedTurns = thematic.players.length;
    thematic.thematicEvents.percent = 100;
    thematic.thematicEvents.triggerBag = {
      ...thematic.thematicEvents.triggerBag,
      cursor: 0,
      order: thematic.thematicEvents.triggerBag.order.map(() => ({
        trigger: true,
      })),
    };
    thematic = run(
      thematic,
      { type: "roll.alchemy", red: 1, yellow: 1 },
      "thematic",
    );
    expect(thematic.lastRoll?.thematicEventOccurrenceId).not.toBeNull();
    expect(thematic.statistics.thematicEventsTriggered).toBe(1);
    expect(thematic.history.thematicEvents).toHaveLength(1);
  });

  it("propagates pending and empty thematic scheduling errors from a roll", () => {
    const pending = newGame();
    pending.thematicEvents.pendingEvent = pendingEvent(pending);
    expectError(
      pending,
      { type: "roll.draw" },
      "INVALID_THEMATIC_STATE",
      "pending-event",
    );
  });
});

describe("official acknowledgement branches", () => {
  it("rejects invalid and stale progress acknowledgements", () => {
    expectError(
      newGame(),
      { type: "resolution.progressAcknowledged", rollId: asRollId("roll") },
      "INVALID_PHASE",
      "progress-phase",
    );

    let noProgress = forceEventFace(newGame(), "barbarian");
    noProgress = run(noProgress, { type: "roll.draw" }, "no-progress-roll");
    expectError(
      noProgress,
      {
        type: "resolution.progressAcknowledged",
        rollId: noProgress.lastRoll!.id,
      },
      "INVALID_PHASE",
      "no-progress",
    );

    let progress = forceEventFace(newGame(), "science");
    progress = run(
      progress,
      { type: "roll.alchemy", red: 1, yellow: 1 },
      "progress-roll",
    );
    expectError(
      progress,
      {
        type: "resolution.progressAcknowledged",
        rollId: asRollId("stale"),
      },
      "STALE_ROLL",
      "progress-stale",
    );
  });

  it("acknowledges progress even when no eligible-player list is recorded", () => {
    let state = forceEventFace(newGame(), "barbarian");
    state = run(state, { type: "roll.draw" }, "barbarian-roll");
    state.resolution.official = {
      ...state.resolution.official!,
      progressPending: true,
    };
    state = run(
      state,
      {
        type: "resolution.progressAcknowledged",
        rollId: state.lastRoll!.id,
      },
      "forced-progress",
    );
    expect(state.resolution.official?.progressPending).toBe(false);
  });

  it("rejects invalid and stale production acknowledgements", () => {
    expectError(
      newGame(),
      { type: "resolution.productionAcknowledged", rollId: asRollId("roll") },
      "INVALID_PHASE",
      "production-phase",
    );

    let progressPending = forceEventFace(newGame(), "science");
    progressPending = run(
      progressPending,
      { type: "roll.alchemy", red: 1, yellow: 1 },
      "production-progress",
    );
    expectError(
      progressPending,
      {
        type: "resolution.productionAcknowledged",
        rollId: progressPending.lastRoll!.id,
      },
      "INVALID_PHASE",
      "production-too-soon",
    );

    let ready = forceEventFace(newGame(), "barbarian");
    ready = run(ready, { type: "roll.draw" }, "production-ready");
    expectError(
      ready,
      {
        type: "resolution.productionAcknowledged",
        rollId: asRollId("stale"),
      },
      "STALE_ROLL",
      "production-stale",
    );
  });

  it("continues to a pending thematic event after production", () => {
    let state = forceEventFace(newGame(), "barbarian");
    state.turn.completedTurns = state.players.length;
    state.thematicEvents.percent = 100;
    state.thematicEvents.triggerBag = {
      ...state.thematicEvents.triggerBag,
      order: state.thematicEvents.triggerBag.order.map(() => ({
        trigger: true,
      })),
    };
    state = run(state, { type: "roll.draw" }, "event-roll");
    state = run(
      state,
      {
        type: "resolution.productionAcknowledged",
        rollId: state.lastRoll!.id,
      },
      "event-production",
    );
    expect(state.turn.phase).toBe("resolving-thematic-event");
  });
});

describe("public-state restrictions and score errors", () => {
  it("rejects wrong phases, pending proposals, and unknown players", () => {
    expectError(
      newGame(),
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { name: "New" },
      },
      "INVALID_PHASE",
      "edit-phase",
    );

    const pending = actionPhase(newGame());
    pending.metropolises.pendingProposal = {
      id: asProposalId("pending"),
      discipline: "science",
      source: "correction",
      from: null,
      to: null,
      changes: [],
      summary: "Pending",
    };
    expectError(
      pending,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { name: "New" },
      },
      "INVALID_PHASE",
      "edit-pending",
    );

    expectError(
      actionPhase(newGame()),
      {
        type: "player.publicStateAdjusted",
        playerId: asPlayerId("missing"),
        patch: { name: "New" },
      },
      "INVALID_PLAYER_STATE",
      "edit-player",
    );
  });

  it("rejects improvement without a city and lowering metropolis holders", () => {
    const noCity = actionPhase(newGame());
    noCity.players[0]!.ordinaryCities = 0;
    expectError(
      noCity,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { improvements: { science: 1 } },
      },
      "INVALID_PLAYER_STATE",
      "no-city",
    );

    for (const status of ["temporary", "permanent"] as const) {
      const holder = actionPhase(newGame());
      holder.players[0]!.ordinaryCities = 0;
      holder.players[0]!.improvements.science = status === "temporary" ? 4 : 5;
      holder.metropolises.controls.science = {
        holderId: PLAYER_IDS[0]!,
        status,
      };
      expectError(
        holder,
        {
          type: "player.publicStateAdjusted",
          playerId: PLAYER_IDS[0]!,
          patch: {
            improvements: { science: status === "temporary" ? 3 : 4 },
          },
        },
        "INVALID_METROPOLIS_STATE",
        `lower-${status}`,
      );
    }
  });

  it("rejects invalid and negative-result score adjustments", () => {
    for (const delta of [0, 1.5]) {
      expectError(
        actionPhase(newGame()),
        {
          type: "player.publicStateAdjusted",
          playerId: PLAYER_IDS[0]!,
          patch: { scoreAdjustment: { delta, reason: "manual" } },
        },
        "INVALID_SCORE",
        `score-${delta}`,
      );
    }
    expectError(
      actionPhase(newGame()),
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { scoreAdjustment: { delta: -4, reason: "correction" } },
      },
      "INVALID_SCORE",
      "negative-score",
    );
  });

  it("commits optional notes, trimmed names, merged counters, and no proposal", () => {
    let state = actionPhase(newGame());
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: {
          name: "  Renamed  ",
          activeKnights: { strong: 1 },
          improvements: { science: 1 },
          scoreAdjustment: {
            delta: 1,
            reason: "merchant",
            note: "Public merchant",
          },
        },
      },
      "full-edit",
    );
    expect(state.players[0]).toMatchObject({
      name: "Renamed",
      activeKnights: { basic: 0, strong: 1, mighty: 0 },
      improvements: { science: 1, trade: 0, politics: 0 },
    });
    expect(state.scoreLedger.at(-1)).toMatchObject({
      delta: 1,
      note: "Public merchant",
    });
    expect(state.metropolises.pendingProposal).toBeNull();
  });

  it("rejects edits that open multiple proposals or lack a city to convert", () => {
    expectError(
      actionPhase(newGame()),
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { improvements: { science: 4, trade: 4 } },
      },
      "INVALID_METROPOLIS_STATE",
      "multi-proposal",
    );

    const cityless = actionPhase(newGame());
    cityless.players[0]!.ordinaryCities = 0;
    cityless.players[0]!.improvements.science = 4;
    cityless.metropolises.controls.science = {
      holderId: PLAYER_IDS[0]!,
      status: "temporary",
    };
    expectError(
      cityless,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0]!,
        patch: { improvements: { trade: 4 } },
      },
      "INVALID_METROPOLIS_STATE",
      "no-convertible-city",
    );
  });
});

describe("metropolis command variants, errors, and cancellation", () => {
  it("rejects malformed controls, wrong phases, pending proposals, and stale IDs", () => {
    expectError(
      actionPhase(newGame()),
      {
        type: "metropolis.assignmentProposed",
        discipline: "science",
        holderId: PLAYER_IDS[0]!,
        status: null,
      },
      "INVALID_COMMAND",
      "control-holder-only",
    );
    expectError(
      actionPhase(newGame()),
      {
        type: "metropolis.assignmentProposed",
        discipline: "science",
        holderId: null,
        status: "temporary",
      },
      "INVALID_COMMAND",
      "control-status-only",
    );
    expectError(
      newGame(),
      {
        type: "metropolis.correctionProposed",
        discipline: "science",
        holderId: null,
        status: null,
      },
      "INVALID_PHASE",
      "metro-phase",
    );
    expectError(
      newGame(),
      {
        type: "metropolis.proposalConfirmed",
        proposalId: asProposalId("stale"),
      },
      "INVALID_PHASE",
      "metro-confirm-phase",
    );
    expectError(
      newGame(),
      {
        type: "metropolis.proposalCancelled",
        proposalId: asProposalId("stale"),
      },
      "INVALID_PHASE",
      "metro-cancel-phase",
    );
    expectError(
      actionPhase(newGame()),
      {
        type: "metropolis.proposalConfirmed",
        proposalId: asProposalId("stale"),
      },
      "METROPOLIS_CONFIRMATION_STALE",
      "metro-confirm-stale",
    );
    expectError(
      actionPhase(newGame()),
      {
        type: "metropolis.proposalCancelled",
        proposalId: asProposalId("stale"),
      },
      "METROPOLIS_CONFIRMATION_STALE",
      "metro-cancel-stale",
    );
  });

  it("cancels a valid assignment without changing public state", () => {
    let state = actionPhase(newGame());
    state.players[0]!.improvements.science = 4;
    state = run(
      state,
      {
        type: "metropolis.assignmentProposed",
        discipline: "science",
        holderId: PLAYER_IDS[0]!,
        status: "temporary",
      },
      "metro-propose",
    );
    const proposalId = state.metropolises.pendingProposal!.id;
    const cities = state.players[0]!.ordinaryCities;
    state = run(
      state,
      { type: "metropolis.proposalCancelled", proposalId },
      "metro-cancel",
    );
    expect(state.metropolises.pendingProposal).toBeNull();
    expect(state.metropolises.controls.science).toBeNull();
    expect(state.players[0]!.ordinaryCities).toBe(cities);
  });

  it("confirms a no-piece-change permanence proposal", () => {
    let state = actionPhase(newGame());
    state.players[0]!.ordinaryCities = 0;
    state.players[0]!.improvements.science = 5;
    state.metropolises.controls.science = {
      holderId: PLAYER_IDS[0]!,
      status: "temporary",
    };
    state = run(
      state,
      {
        type: "metropolis.assignmentProposed",
        discipline: "science",
        holderId: PLAYER_IDS[0]!,
        status: "permanent",
      },
      "metro-permanent-propose",
    );
    state = run(
      state,
      {
        type: "metropolis.proposalConfirmed",
        proposalId: state.metropolises.pendingProposal!.id,
      },
      "metro-permanent-confirm",
    );
    expect(state.metropolises.controls.science?.status).toBe("permanent");
  });
});

describe("attack confirmation edge cases", () => {
  function tiedAttack(): GameState {
    // Manually construct a legacy state in resolving-barbarian-attack phase
    // since auto-resolve no longer produces this phase.
    const base = newGame({ trackLength: 1 });
    base.players[0]!.activeKnights.strong = 1;
    base.players[1]!.activeKnights.strong = 1;
    const proposalId = asProposalId("tied-proposal");
    return {
      ...base,
      turn: { ...base.turn, phase: "resolving-barbarian-attack" },
      barbarian: {
        ...base.barbarian,
        shipPosition: base.barbarian.rules.trackLength,
        pendingAttack: {
          id: proposalId,
          strengths: {
            barbarian: 3,
            defenders: 2,
            contributions: PLAYER_IDS.map((id) => ({
              playerId: id,
              strength: id === PLAYER_IDS[0] || id === PLAYER_IDS[1] ? 2 : 0,
            })),
          },
          outcome: {
            type: "defenders-win" as const,
            reward: {
              type: "progress-choice" as const,
              playerIds: [PLAYER_IDS[0]!, PLAYER_IDS[1]!],
            },
          },
          firstAttack: false,
          summary: "Test tied attack",
        },
      },
      resolution: { official: null },
    };
  }

  it("auto-resolves barbarian attacks without entering resolving-barbarian-attack", () => {
    const state = forceEventFace(newGame({ trackLength: 1 }), "barbarian");
    const result = run(state, { type: "roll.draw" }, "auto-resolve-check");
    expect(result.turn.phase).toBe("resolving-official-result");
    expect(result.barbarian.pendingAttack).toBeNull();
    expect(result.barbarian.shipPosition).toBe(0);
    expect(result.barbarian.attacksCompleted).toBe(1);
  });

  it("recovers a legacy attack without changing physical-board state", () => {
    const state = tiedAttack();
    const playersBefore = structuredClone(state.players);
    const next = run(
      state,
      {
        type: "attack.confirmed",
        proposalId: state.barbarian.pendingAttack!.id,
        manualOutcome: { type: "board-authoritative" },
        progressChoices: [],
      },
      "attack-board-recovery",
    );

    expect(next.turn.phase).toBe("action-phase");
    expect(next.players).toEqual(playersBefore);
    expect(next.barbarian.pendingAttack).toBeNull();
    expect(next.barbarian.history.at(-1)?.outcome).toEqual({
      type: "board-authoritative",
    });
  });

  it("rejects wrong phases, stale proposals, incomplete, duplicate, and unexpected choices (legacy)", () => {
    expectError(
      newGame(),
      {
        type: "attack.confirmed",
        proposalId: asProposalId("missing"),
        manualOutcome: { type: "barbarians-win", pillagedPlayerIds: [] },
      },
      "INVALID_PHASE",
      "attack-phase",
    );

    const tied = tiedAttack();
    expectError(
      tied,
      {
        type: "attack.confirmed",
        proposalId: asProposalId("stale"),
        manualOutcome: { type: "barbarians-win", pillagedPlayerIds: [] },
      },
      "ATTACK_CONFIRMATION_STALE",
      "attack-stale",
    );
    expectError(
      tied,
      {
        type: "attack.confirmed",
        proposalId: tied.barbarian.pendingAttack!.id,
        manualOutcome: {
          type: "barbarians-win",
          pillagedPlayerIds: [asPlayerId("missing-player")],
        },
      },
      "INVALID_COMMAND",
      "attack-missing-player",
    );

    const noCity = tiedAttack();
    noCity.players[0]!.ordinaryCities = 0;
    expectError(
      noCity,
      {
        type: "attack.confirmed",
        proposalId: noCity.barbarian.pendingAttack!.id,
        manualOutcome: {
          type: "barbarians-win",
          pillagedPlayerIds: [PLAYER_IDS[0]!],
        },
      },
      "INVALID_COMMAND",
      "attack-no-city",
    );
    expectError(
      tied,
      {
        type: "attack.confirmed",
        proposalId: tied.barbarian.pendingAttack!.id,
        manualOutcome: tied.barbarian.pendingAttack!.outcome,
        progressChoices: [{ playerId: PLAYER_IDS[0]!, discipline: "science" }],
      },
      "INVALID_COMMAND",
      "attack-incomplete",
    );
    expectError(
      tied,
      {
        type: "attack.confirmed",
        proposalId: tied.barbarian.pendingAttack!.id,
        manualOutcome: tied.barbarian.pendingAttack!.outcome,
        progressChoices: [
          { playerId: PLAYER_IDS[0]!, discipline: "science" },
          { playerId: PLAYER_IDS[0]!, discipline: "trade" },
        ],
      },
      "INVALID_COMMAND",
      "attack-duplicate",
    );

    const loss = tiedAttack();
    // Override to a barbarians-win outcome for the loss test case.
    loss.barbarian.pendingAttack = {
      ...loss.barbarian.pendingAttack!,
      outcome: {
        type: "barbarians-win",
        pillagedPlayerIds: [...PLAYER_IDS],
      },
    };
    expectError(
      loss,
      {
        type: "attack.confirmed",
        proposalId: loss.barbarian.pendingAttack.id,
        manualOutcome: loss.barbarian.pendingAttack.outcome,
        progressChoices: [{ playerId: PLAYER_IDS[0]!, discipline: "science" }],
      },
      "INVALID_COMMAND",
      "attack-unexpected",
    );
  });

  it("returns directly to action or a thematic event when no official work remains", () => {
    function manuallyResolvedAttack(withEvent: boolean): GameState {
      const state = newGame({ trackLength: 1 });
      const proposalId = asProposalId(`manual-${withEvent}`);
      const event = withEvent ? pendingEvent(state) : null;
      return {
        ...state,
        turn: { ...state.turn, phase: "resolving-barbarian-attack" },
        barbarian: {
          ...state.barbarian,
          shipPosition: 1,
          pendingAttack: {
            id: proposalId,
            strengths: {
              barbarian: 3,
              defenders: 3,
              contributions: [
                { playerId: PLAYER_IDS[0]!, strength: 3 },
                { playerId: PLAYER_IDS[1]!, strength: 0 },
                { playerId: PLAYER_IDS[2]!, strength: 0 },
              ],
            },
            firstAttack: true,
            outcome: {
              type: "defenders-win",
              reward: { type: "defender-point", playerId: PLAYER_IDS[0]! },
            },
            summary: "Manual win",
          },
        },
        thematicEvents: { ...state.thematicEvents, pendingEvent: event },
        history: {
          ...state.history,
          thematicEvents: event === null ? [] : [event],
        },
      };
    }

    let action = manuallyResolvedAttack(false);
    const actionProposal = action.barbarian.pendingAttack!.id;
    action = run(
      action,
      {
        type: "attack.confirmed",
        proposalId: actionProposal,
        manualOutcome: action.barbarian.pendingAttack!.outcome,
      },
      "attack-action",
    );
    expect(action.turn.phase).toBe("action-phase");

    let event = manuallyResolvedAttack(true);
    const eventProposal = event.barbarian.pendingAttack!.id;
    event = run(
      event,
      {
        type: "attack.confirmed",
        proposalId: eventProposal,
        manualOutcome: event.barbarian.pendingAttack!.outcome,
      },
      "attack-event",
    );
    expect(event.turn.phase).toBe("resolving-thematic-event");
  });

  it("applies each manual outcome branch to players, scores, and statistics", () => {
    // These outcome shapes are only reachable through the legacy manual
    // confirmation path, so they need explicit coverage.
    function manualAttack(
      outcome: GameState["barbarian"]["pendingAttack"] extends null
        ? never
        : NonNullable<GameState["barbarian"]["pendingAttack"]>["outcome"],
      label: string,
    ): GameState {
      const base = newGame({ trackLength: 1 });
      base.players[0]!.activeKnights.strong = 1;
      return {
        ...base,
        turn: { ...base.turn, phase: "resolving-barbarian-attack" },
        barbarian: {
          ...base.barbarian,
          shipPosition: base.barbarian.rules.trackLength,
          pendingAttack: {
            id: asProposalId(label),
            strengths: {
              barbarian: 3,
              defenders: 1,
              contributions: PLAYER_IDS.map((id) => ({
                playerId: id,
                strength: id === PLAYER_IDS[0] ? 1 : 0,
              })),
            },
            outcome,
            firstAttack: false,
            summary: `Manual ${label}`,
          },
        },
        resolution: { official: null },
      };
    }

    // Defenders win with a single top contributor: one Defender point is
    // awarded and knights are cleared.
    const pointState = manualAttack(
      {
        type: "defenders-win",
        reward: { type: "defender-point", playerId: PLAYER_IDS[0]! },
      },
      "manual-defender-point",
    );
    const point = run(
      pointState,
      {
        type: "attack.confirmed",
        proposalId: pointState.barbarian.pendingAttack!.id,
        manualOutcome: pointState.barbarian.pendingAttack!.outcome,
      },
      "manual-point",
    );
    expect(point.statistics.barbarianAttacksWon).toBe(1);
    expect(point.statistics.barbarianAttacksLost).toBe(0);
    expect(point.scoreLedger.at(-1)).toMatchObject({
      playerId: PLAYER_IDS[0],
      delta: 1,
      reason: "defender",
    });
    expect(point.players[0]?.activeKnights).toEqual({
      basic: 0,
      strong: 0,
      mighty: 0,
    });
    expect(point.barbarian.history.at(-1)?.outcome).toMatchObject({
      type: "defenders-win",
    });

    // Barbarians win and pillage: each listed player loses one ordinary city.
    const pillageState = manualAttack(
      { type: "barbarians-win", pillagedPlayerIds: [PLAYER_IDS[0]!] },
      "manual-pillage",
    );
    const citiesBefore = pillageState.players[0]!.ordinaryCities;
    const pillage = run(
      pillageState,
      {
        type: "attack.confirmed",
        proposalId: pillageState.barbarian.pendingAttack!.id,
        manualOutcome: pillageState.barbarian.pendingAttack!.outcome,
      },
      "manual-pillage-run",
    );
    expect(pillage.statistics.barbarianAttacksLost).toBe(1);
    expect(pillage.statistics.barbarianAttacksWon).toBe(0);
    expect(pillage.players[0]?.ordinaryCities).toBe(citiesBefore - 1);

    // Barbarians win with nothing to pillage: no city is deducted.
    const emptyState = manualAttack(
      { type: "barbarians-win", pillagedPlayerIds: [] },
      "manual-empty",
    );
    const empty = run(
      emptyState,
      {
        type: "attack.confirmed",
        proposalId: emptyState.barbarian.pendingAttack!.id,
        manualOutcome: emptyState.barbarian.pendingAttack!.outcome,
      },
      "manual-empty-run",
    );
    expect(empty.statistics.barbarianAttacksLost).toBe(1);
    expect(empty.players.map((player) => player.ordinaryCities)).toEqual(
      emptyState.players.map((player) => player.ordinaryCities),
    );
  });

  it("resolves a tied defence through explicit progress choices", () => {
    const tied = tiedAttack();
    const next = run(
      tied,
      {
        type: "attack.confirmed",
        proposalId: tied.barbarian.pendingAttack!.id,
        manualOutcome: tied.barbarian.pendingAttack!.outcome,
        progressChoices: [
          { playerId: PLAYER_IDS[0]!, discipline: "science" },
          { playerId: PLAYER_IDS[1]!, discipline: "trade" },
        ],
      },
      "attack-tied-choices",
    );

    expect(next.barbarian.pendingAttack).toBeNull();
    expect(next.barbarian.history.at(-1)?.progressChoices).toEqual([
      { playerId: PLAYER_IDS[0], discipline: "science" },
      { playerId: PLAYER_IDS[1], discipline: "trade" },
    ]);
    // A tied defence awards decks rather than a Defender point.
    expect(next.scoreLedger).toEqual(tied.scoreLedger);
    expect(next.statistics.barbarianAttacksWon).toBe(1);
  });

  it("stays in official resolution when production is still pending", () => {
    const base = tiedAttack();
    const rollId = asRollId("pending-roll");
    const pending: GameState = {
      ...base,
      lastRoll: {
        id: rollId,
        playerId: PLAYER_IDS[0]!,
        turnNumber: base.turn.turnNumber,
        round: base.turn.round,
        numbered: { red: 3, yellow: 4 },
        total: 7,
        eventFace: "barbarian",
        alchemy: false,
        numberedDeckCycle: base.numberedDeck.cycle,
        numberedDeckIndex: 0,
        eventDeckCycle: base.eventDeck.cycle,
        eventDeckIndex: 0,
        progress: null,
        production: {
          type: "seven",
          robberActive: false,
          reminder: "robber-not-yet-active",
        },
        thematicEventOccurrenceId: null,
        createdAt: asIsoTimestamp("2026-07-12T12:00:00Z"),
      },
      resolution: {
        official: {
          rollId,
          progressPending: false,
          productionPending: true,
        },
      },
    };
    const next = run(
      pending,
      {
        type: "attack.confirmed",
        proposalId: pending.barbarian.pendingAttack!.id,
        manualOutcome: { type: "board-authoritative" },
        progressChoices: [],
      },
      "attack-official-pending",
    );
    expect(next.turn.phase).toBe("resolving-official-result");
  });
});

describe("thematic acknowledgement, turn ending, and completion", () => {
  it("rejects wrong-phase and stale thematic acknowledgements", () => {
    expectError(
      newGame(),
      { type: "event.acknowledged", occurrenceId: "occurrence" as never },
      "INVALID_PHASE",
      "event-phase",
    );

    const state = newGame();
    const event = pendingEvent(state);
    const resolving: GameState = {
      ...state,
      turn: { ...state.turn, phase: "resolving-thematic-event" },
      thematicEvents: { ...state.thematicEvents, pendingEvent: event },
      history: { ...state.history, thematicEvents: [event] },
    };
    expectError(
      resolving,
      { type: "event.acknowledged", occurrenceId: "stale" as never },
      "INVALID_COMMAND",
      "event-stale",
    );
  });

  it("acknowledges only the matching thematic history occurrence", () => {
    const state = newGame();
    const event = pendingEvent(state);
    const other = {
      ...event,
      occurrenceId: "other" as never,
      acknowledged: false,
    };
    let resolving: GameState = {
      ...state,
      turn: { ...state.turn, phase: "resolving-thematic-event" },
      thematicEvents: { ...state.thematicEvents, pendingEvent: event },
      history: { ...state.history, thematicEvents: [other, event] },
    };
    resolving = run(
      resolving,
      { type: "event.acknowledged", occurrenceId: event.occurrenceId },
      "event-ack",
    );
    expect(resolving.history.thematicEvents).toMatchObject([
      { occurrenceId: other.occurrenceId, acknowledged: false },
      { occurrenceId: event.occurrenceId, acknowledged: true },
    ]);
  });

  it("rejects ending outside action phase or with a pending metropolis", () => {
    expectError(
      newGame(),
      { type: "turn.ended" },
      "INVALID_PHASE",
      "turn-phase",
    );
    const pending = actionPhase(newGame());
    pending.metropolises.pendingProposal = {
      id: asProposalId("proposal"),
      discipline: "science",
      source: "correction",
      from: null,
      to: null,
      changes: [],
      summary: "Pending",
    };
    expectError(
      pending,
      { type: "turn.ended" },
      "INVALID_PHASE",
      "turn-pending",
    );
  });

  it("reports winner candidates after a non-round-ending turn", () => {
    let state = actionPhase(newGame({ setup: setup({ victoryTarget: 3 }) }));
    const decision = unwrap(
      decide(state, { type: "turn.ended" }, deps("turn")),
    );
    state = decision.nextState;
    expect(decision.presentation).toMatchObject({
      type: "turn",
      round: 1,
      winnerCandidateIds: PLAYER_IDS,
    });
    expect(state.statistics.completedRounds).toBe(0);
  });

  it("rejects completion outside action phase and unknown or ineligible winners", () => {
    expectError(
      newGame(),
      { type: "game.completed", winnerId: PLAYER_IDS[0]! },
      "INVALID_PHASE",
      "complete-phase",
    );
    expectError(
      actionPhase(newGame()),
      { type: "game.completed", winnerId: asPlayerId("missing") },
      "WINNER_NOT_ELIGIBLE",
      "complete-missing",
    );
    expectError(
      actionPhase(newGame()),
      { type: "game.completed", winnerId: PLAYER_IDS[0]! },
      "WINNER_NOT_ELIGIBLE",
      "complete-early",
    );
  });
});
