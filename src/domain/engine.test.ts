import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMATIC_EVENTS,
  PROGRESS_ELIGIBILITY_2025,
  asEventId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  createThematicEventDeck,
  decide,
  isProgressEligible,
  scheduleThematicEvent,
  scoreForPlayer,
  validateGameState,
} from "./index";
import type {
  DomainDeps,
  DomainResult,
  EventFace,
  GameCommand,
  GameSetup,
  GameState,
  IdSource,
  PlayerId,
  ThematicEventState,
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

function deps(
  prefix: string,
  random: (upperExclusive: number) => number = () => 0,
): DomainDeps {
  return {
    at: asIsoTimestamp("2026-07-12T21:38:00Z"),
    revisionId: asRevisionId(`revision-${prefix}`),
    random,
    ids: idSource(`command-${prefix}`),
  };
}

function setup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    title: "Domain test",
    mode: "standard",
    players: PLAYER_IDS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `color-${index}`,
        label: `Color ${index}`,
        hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
        distinguishabilityKey: `distinct-${index}`,
      },
    })),
    firstPlayerId: PLAYER_IDS[0] as PlayerId,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: true,
    thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
      ...event,
    })),
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
    ...overrides,
  };
}

function newGame(
  options: {
    setup?: GameSetup;
    barbarianTrackLength?: number;
    random?: (upperExclusive: number) => number;
    prefix?: string;
  } = {},
): GameState {
  const prefix = options.prefix ?? "create";
  const result = createGame({
    gameId: asGameId(`game-${prefix}`),
    revisionId: asRevisionId(`revision-${prefix}`),
    createdAt: asIsoTimestamp("2026-07-12T20:00:00Z"),
    setup: options.setup ?? setup(),
    random: options.random ?? (() => 0),
    ids: idSource(prefix),
    ...(options.barbarianTrackLength === undefined
      ? {}
      : { barbarianRules: { trackLength: options.barbarianTrackLength } }),
  });
  return unwrap(result).nextState;
}

function run(
  state: GameState,
  command: GameCommand,
  prefix: string,
  random?: (upperExclusive: number) => number,
): GameState {
  return unwrap(decide(state, command, deps(prefix, random))).nextState;
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function withNextEventFace(state: GameState, face: EventFace): GameState {
  const index = state.eventDeck.order.indexOf(face, state.eventDeck.cursor);
  const sourceIndex = index >= 0 ? index : state.eventDeck.order.indexOf(face);
  const order = [...state.eventDeck.order];
  const current = order[state.eventDeck.cursor] as EventFace;
  order[state.eventDeck.cursor] = face;
  order[sourceIndex] = current;
  return { ...state, eventDeck: { ...state.eventDeck, order } };
}

function actionPhase(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: "action-phase" },
    resolution: { official: null },
    thematicEvents: { ...state.thematicEvents, pendingEvent: null },
  };
}

describe("game creation and roll transactions", () => {
  it("creates serializable state with ledger-derived standard scores", () => {
    const state = newGame();
    expect(state.turn.phase).toBe("awaiting-roll");
    expect(
      state.players.map((player) => scoreForPlayer(state, player.id)),
    ).toEqual([3, 3, 3]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(validateGameState(state)).toEqual([]);
  });

  it("uses Alchemy without moving the numbered cursor while consuming the event deck", () => {
    const state = newGame();
    const numberedCursor = state.numberedDeck.cursor;
    const eventCursor = state.eventDeck.cursor;
    const decision = unwrap(
      decide(
        state,
        { type: "roll.alchemy", red: 6, yellow: 1 },
        deps("alchemy"),
      ),
    );
    expect(decision.nextState.numberedDeck.cursor).toBe(numberedCursor);
    expect(decision.nextState.eventDeck.cursor).toBe(eventCursor + 1);
    expect(decision.nextState.lastRoll).toMatchObject({
      alchemy: true,
      total: 7,
      numberedDeckIndex: null,
    });
    expect(decision.nextState.statistics.alchemyRolls).toBe(1);
  });

  it("does not mutate a restorable snapshot and replays a roll deterministically", () => {
    const state = newGame({ prefix: "restore" });
    const snapshot = JSON.stringify(state);
    const first = unwrap(
      decide(
        state,
        { type: "roll.draw" },
        deps("replay", () => 0),
      ),
    ).nextState;
    expect(JSON.stringify(state)).toBe(snapshot);
    const restored = JSON.parse(snapshot) as GameState;
    const replayed = unwrap(
      decide(
        restored,
        { type: "roll.draw" },
        deps("replay", () => 0),
      ),
    ).nextState;
    expect(replayed).toEqual(first);
  });

  it("enforces progress before production acknowledgement", () => {
    let state = withNextEventFace(newGame(), "science");
    state = run(
      state,
      { type: "roll.alchemy", red: 1, yellow: 2 },
      "resolution-roll",
    );
    const rollId = state.lastRoll?.id;
    expect(
      decide(
        state,
        {
          type: "resolution.productionAcknowledged",
          rollId: rollId as never,
        },
        deps("resolution-too-early"),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_PHASE" } });
    state = run(
      state,
      {
        type: "resolution.progressAcknowledged",
        rollId: rollId as never,
      },
      "resolution-progress",
    );
    state = run(
      state,
      {
        type: "resolution.productionAcknowledged",
        rollId: rollId as never,
      },
      "resolution-production",
    );
    expect(state.turn.phase).toBe("action-phase");
    expect(state.resolution.official).toBeNull();
  });
});

describe("2025 progress eligibility", () => {
  it("matches the explicit board lookup at every level and red value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 6 }),
        (level, red) => {
          expect(
            isProgressEligible(
              level as keyof typeof PROGRESS_ELIGIBILITY_2025,
              red as 1 | 2 | 3 | 4 | 5 | 6,
            ),
          ).toBe(
            PROGRESS_ELIGIBILITY_2025[
              level as keyof typeof PROGRESS_ELIGIBILITY_2025
            ].includes(red),
          );
        },
      ),
    );
  });

  it("orders eligible players from the current player", () => {
    let state = newGame();
    state = {
      ...state,
      turn: { ...state.turn, currentPlayerIndex: 1 },
      players: state.players.map((player, index) => ({
        ...player,
        improvements: {
          ...player.improvements,
          science: [1, 2, 0][index] as 0 | 1 | 2,
        },
      })),
    };
    state = withNextEventFace(state, "science");
    const rolled = unwrap(
      decide(
        state,
        { type: "roll.alchemy", red: 3, yellow: 3 },
        deps("progress"),
      ),
    ).nextState;
    expect(rolled.lastRoll?.progress?.eligiblePlayerIds).toEqual([
      PLAYER_IDS[1],
    ]);
  });
});

describe("barbarian attacks", () => {
  it("auto-resolves the attack and resets only the app-owned cycle", () => {
    let state = newGame({ barbarianTrackLength: 1 });
    state = withNextEventFace(state, "barbarian");
    state = run(state, { type: "roll.draw" }, "attack-auto-resolve");

    // The attack is logged and the cycle resets without any table input.
    expect(state.turn.phase).toBe("resolving-official-result");
    expect(state.barbarian).toMatchObject({
      shipPosition: 0,
      robberActivated: true,
      attacksCompleted: 1,
    });
    // Only the fact that an attack happened is recorded.
    expect(state.barbarian.history).toHaveLength(1);
    expect(state.barbarian.history[0]?.completedAt).toBeDefined();
    expect(state.statistics.barbarianAttacks).toBe(1);
  });

  it("continues straight to official resolution after an attack", () => {
    let state = newGame({ barbarianTrackLength: 1 });
    state = withNextEventFace(state, "barbarian");
    state = run(state, { type: "roll.draw" }, "attack-skip-phase");
    expect(state.turn.phase).toBe("resolving-official-result");
  });

  it("records the robber as active when the attack lands on the same roll as a seven", () => {
    // The ship reaching the end is what activates the robber, and it can happen
    // on the very roll that also totals seven. Describing the roll before
    // moving the ship recorded "the robber is not active yet" on exactly the
    // roll that activated it, and that wrong value was persisted into the
    // revision, the history and any export.
    let state = newGame({ barbarianTrackLength: 1 });
    state = withNextEventFace(state, "barbarian");
    const sevenIndex = state.numberedDeck.order.findIndex(
      (outcome) => outcome.red + outcome.yellow === 7,
    );
    expect(sevenIndex).toBeGreaterThanOrEqual(0);
    state = {
      ...state,
      numberedDeck: { ...state.numberedDeck, cursor: sevenIndex },
    };
    expect(state.barbarian.robberActivated).toBe(false);

    state = run(state, { type: "roll.draw" }, "attack-with-seven");

    expect(state.barbarian.robberActivated).toBe(true);
    expect(state.lastRoll?.production).toEqual({
      type: "seven",
      robberActive: true,
      reminder: "discard-and-move-robber",
    });
  });

  it("still resolves a ship already sitting on the last space", () => {
    // Not reachable through normal play, but an imported or migrated save can
    // carry it. The invariants accept it, so the roll must too: landing only on
    // a strict equality left such a save rejecting every barbarian roll for the
    // rest of the game with no way back.
    let state = newGame({ barbarianTrackLength: 7 });
    state = {
      ...state,
      barbarian: { ...state.barbarian, shipPosition: 7 },
    };
    expect(validateGameState(state)).toEqual([]);

    state = withNextEventFace(state, "barbarian");
    state = run(state, { type: "roll.draw" }, "attack-parked-ship");

    expect(state.barbarian).toMatchObject({
      shipPosition: 0,
      robberActivated: true,
      attacksCompleted: 1,
    });
  });
});

describe("metropolis lifecycle", () => {
  it("assigns temporary control at level 4, makes it permanent at level 5, and never transfers normally", () => {
    let state = actionPhase(newGame());
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0] as PlayerId,
        patch: { improvements: { science: 4 } },
      },
      "metro-level4",
    );
    let proposal = state.metropolises.pendingProposal;
    expect(proposal?.to).toEqual({
      holderId: PLAYER_IDS[0],
      status: "temporary",
    });
    state = run(
      state,
      {
        type: "metropolis.proposalConfirmed",
        proposalId: proposal?.id as never,
      },
      "metro-confirm4",
    );
    expect(scoreForPlayer(state, PLAYER_IDS[0] as PlayerId)).toBe(5);

    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0] as PlayerId,
        patch: { improvements: { science: 5 } },
      },
      "metro-level5",
    );
    proposal = state.metropolises.pendingProposal;
    expect(proposal?.to).toEqual({
      holderId: PLAYER_IDS[0],
      status: "permanent",
    });
    expect(proposal?.changes).toEqual([]);
    state = run(
      state,
      {
        type: "metropolis.proposalConfirmed",
        proposalId: proposal?.id as never,
      },
      "metro-confirm5",
    );
    expect(state.metropolises.controls.science?.status).toBe("permanent");

    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[1] as PlayerId,
        patch: { improvements: { science: 5 } },
      },
      "metro-other5",
    );
    expect(state.metropolises.pendingProposal).toBeNull();
    const transfer = decide(
      state,
      {
        type: "metropolis.assignmentProposed",
        discipline: "science",
        holderId: PLAYER_IDS[1] as PlayerId,
        status: "permanent",
      },
      deps("metro-transfer"),
    );
    expect(transfer).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });
  });

  it("uses correction proposals to repair physical control atomically", () => {
    let state = actionPhase(newGame());
    state = {
      ...state,
      players: state.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              improvements: { ...player.improvements, trade: 4 },
            }
          : player,
      ),
    };
    state = run(
      state,
      {
        type: "metropolis.correctionProposed",
        discipline: "trade",
        holderId: PLAYER_IDS[1] as PlayerId,
        status: "temporary",
      },
      "metro-correction",
    );
    const proposal = state.metropolises.pendingProposal;
    state = run(
      state,
      {
        type: "metropolis.proposalConfirmed",
        proposalId: proposal?.id as never,
      },
      "metro-correction-confirm",
    );
    expect(state.metropolises.controls.trade?.holderId).toBe(PLAYER_IDS[1]);
    expect(scoreForPlayer(state, PLAYER_IDS[1] as PlayerId)).toBe(5);
  });
});

describe("thematic cadence and cooldown", () => {
  function forcedTriggerState(
    state: ThematicEventState,
    cycle: number,
  ): ThematicEventState {
    return {
      ...state,
      triggerBag: {
        ...state.triggerBag,
        cycle,
        cursor: 0,
        order: state.triggerBag.order.map((_, index) => ({
          trigger: index === 0,
        })),
      },
    };
  }

  it("uses the active season for each World Event trigger", () => {
    const nature = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "nature",
    )!;
    const military = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "military",
    )!;
    const base = newGame({
      setup: setup({
        thematicEventCatalog: [{ ...nature }, { ...military }],
        seasonConfig: {
          enabled: true,
          roundsPerSeason: 2,
          startingSeason: "spring",
        },
      }),
    });
    const thematic: ThematicEventState = {
      ...base.thematicEvents,
      enabledEvents: [{ ...nature }, { ...military }],
      eventDeck: {
        ...base.thematicEvents.eventDeck,
        cursor: 0,
        order: [nature.id, military.id],
      },
      deferredTrigger: true,
    };
    const middleRoll = (upperExclusive: number) =>
      Math.floor(upperExclusive * 0.45);
    const config = base.setup.seasonConfig!;

    const spring = unwrap(
      scheduleThematicEvent(
        thematic,
        3,
        base.players.length,
        middleRoll,
        asRevisionId("season-spring"),
        "season-spring-occurrence" as never,
        config,
        1,
      ),
    );
    expect(spring.event?.eventId).toBe(nature.id);

    const summer = unwrap(
      scheduleThematicEvent(
        thematic,
        3,
        base.players.length,
        middleRoll,
        asRevisionId("season-summer"),
        "season-summer-occurrence" as never,
        config,
        3,
      ),
    );
    expect(summer.event?.eventId).toBe(military.id);
  });

  it("starts a new seasonal deck cycle and preserves cross-cycle balance", () => {
    const nature = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "nature",
    )!;
    const military = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "military",
    )!;
    const base = newGame();
    const thematic: ThematicEventState = {
      ...base.thematicEvents,
      enabledEvents: [{ ...nature }, { ...military }],
      eventDeck: {
        ...base.thematicEvents.eventDeck,
        cursor: 2,
        order: [nature.id, military.id],
      },
      previousEventId: military.id,
      deferredTrigger: true,
    };
    const result = unwrap(
      scheduleThematicEvent(
        thematic,
        3,
        base.players.length,
        () => 0,
        asRevisionId("season-cycle"),
        "season-cycle-occurrence" as never,
        { enabled: true, roundsPerSeason: 3, startingSeason: "spring" },
        1,
      ),
    );
    expect(result.event?.eventId).toBe(nature.id);
    expect(result.state.eventDeck).toMatchObject({ cycle: 2, cursor: 1 });
  });

  it("tolerates missing previous-event metadata in a persisted deck", () => {
    const nature = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "nature",
    )!;
    const military = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "military",
    )!;
    const base = newGame();
    const result = unwrap(
      scheduleThematicEvent(
        {
          ...base.thematicEvents,
          enabledEvents: [{ ...nature }, { ...military }],
          eventDeck: {
            ...base.thematicEvents.eventDeck,
            cursor: 0,
            order: [military.id, nature.id],
          },
          previousEventId: asEventId("legacy-previous-event"),
          deferredTrigger: true,
        },
        3,
        base.players.length,
        () => 0,
        asRevisionId("season-prefix"),
        "season-prefix-occurrence" as never,
        { enabled: true, roundsPerSeason: 3, startingSeason: "spring" },
        1,
      ),
    );
    expect(result.event?.eventId).toBe(military.id);
  });

  it("rejects unknown content in a seasonal event deck", () => {
    const nature = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "nature",
    )!;
    const military = BUILT_IN_THEMATIC_EVENTS.find(
      (event) => event.category === "military",
    )!;
    const base = newGame();
    const result = scheduleThematicEvent(
      {
        ...base.thematicEvents,
        enabledEvents: [{ ...nature }, { ...military }],
        eventDeck: {
          ...base.thematicEvents.eventDeck,
          cursor: 0,
          order: [asEventId("missing-season-event"), nature.id],
        },
        deferredTrigger: true,
      },
      3,
      base.players.length,
      () => 0,
      asRevisionId("season-corrupt"),
      "season-corrupt-occurrence" as never,
      { enabled: true, roundsPerSeason: 3, startingSeason: "spring" },
      1,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_THEMATIC_STATE" },
    });
  });

  it("defers an early trigger and enforces two completed turns between events", () => {
    const game = newGame();
    let thematic = forcedTriggerState(game.thematicEvents, 1);
    let scheduled = unwrap(
      scheduleThematicEvent(
        thematic,
        0,
        game.players.length,
        () => 0,
        asRevisionId("theme-1"),
        "occurrence-1" as never,
      ),
    );
    expect(scheduled.event).toBeNull();
    expect(scheduled.state.deferredTrigger).toBe(true);

    scheduled = unwrap(
      scheduleThematicEvent(
        scheduled.state,
        3,
        game.players.length,
        () => 0,
        asRevisionId("theme-2"),
        "occurrence-2" as never,
      ),
    );
    expect(scheduled.event).not.toBeNull();
    thematic = {
      ...forcedTriggerState(scheduled.state, 2),
      pendingEvent: null,
    };
    scheduled = unwrap(
      scheduleThematicEvent(
        thematic,
        4,
        game.players.length,
        () => 0,
        asRevisionId("theme-3"),
        "occurrence-3" as never,
      ),
    );
    expect(scheduled.event).toBeNull();
    expect(scheduled.state.deferredTrigger).toBe(true);
    scheduled = unwrap(
      scheduleThematicEvent(
        scheduled.state,
        5,
        game.players.length,
        () => 0,
        asRevisionId("theme-4"),
        "occurrence-4" as never,
      ),
    );
    expect(scheduled.event).not.toBeNull();
  });

  it("builds percent-based trigger bags and avoids an immediate event repeat across a boundary", () => {
    for (const percent of [3, 8, 25, 50, 100] as const) {
      const state = newGame({
        setup: setup({ thematicEventPercent: percent }),
      });
      expect(state.thematicEvents.triggerBag.order).toHaveLength(100);
      expect(
        state.thematicEvents.triggerBag.order.filter((token) => token.trigger),
      ).toHaveLength(percent);
    }
    const events = [
      {
        id: asEventId("one"),
        contentVersion: 1,
        title: "One",
        instruction: "One instruction",
      },
      {
        id: asEventId("two"),
        contentVersion: 1,
        title: "Two",
        instruction: "Two instruction",
      },
    ];
    const deck = createThematicEventDeck(
      events,
      () => 1,
      asRevisionId("theme-deck"),
      asEventId("one"),
      2,
    );
    expect(deck.order[0]).toBe(asEventId("two"));
  });

  it("acknowledges durable thematic content before the action phase", () => {
    const state = newGame();
    const definition = state.thematicEvents.enabledEvents[0];
    expect(definition).toBeDefined();
    if (definition === undefined) return;
    const event = {
      occurrenceId: "ack-event" as never,
      eventId: definition.id,
      contentVersion: definition.contentVersion,
      title: definition.title,
      instruction: definition.instruction,
      triggeredAtCompletedTurn: 3,
      acknowledged: false,
    };
    const resolving: GameState = {
      ...state,
      turn: { ...state.turn, phase: "resolving-thematic-event" },
      thematicEvents: { ...state.thematicEvents, pendingEvent: event },
      history: { ...state.history, thematicEvents: [event] },
    };
    const acknowledged = run(
      resolving,
      {
        type: "event.acknowledged",
        occurrenceId: event.occurrenceId,
      },
      "theme-ack",
    );
    expect(acknowledged.turn.phase).toBe("action-phase");
    expect(acknowledged.thematicEvents.pendingEvent).toBeNull();
    expect(acknowledged.history.thematicEvents[0]?.acknowledged).toBe(true);
  });
});

describe("turns, invariants, and completion", () => {
  it("advances clockwise and increments rounds after every player completes a turn", () => {
    let state = actionPhase(newGame());
    for (let index = 0; index < 3; index += 1) {
      state = run(state, { type: "turn.ended" }, `turn-${index}`);
      if (index < 2) state = actionPhase(state);
    }
    expect(state.turn).toMatchObject({
      currentPlayerIndex: 0,
      completedTurns: 3,
      round: 2,
      turnNumber: 4,
    });
    expect(state.statistics.completedRounds).toBe(1);
  });

  it("journals a season transition at the round boundary", () => {
    let state = actionPhase(
      newGame({
        setup: setup({
          seasonConfig: {
            enabled: true,
            roundsPerSeason: 2,
            startingSeason: "spring",
          },
        }),
      }),
    );
    for (let index = 0; index < 5; index += 1) {
      state = run(state, { type: "turn.ended" }, `season-turn-${index}`);
      state = actionPhase(state);
    }
    const decision = unwrap(
      decide(state, { type: "turn.ended" }, deps("season-transition")),
    );
    expect(decision.nextState.turn.round).toBe(3);
    expect(decision.summary).toMatchObject({ kind: "turn-ended" });
    expect(decision.summary.text).toContain("Summer began.");
  });

  it("rejects corrupt state before deciding and invalid edits without clamping", () => {
    const state = actionPhase(newGame());
    const corrupt = {
      ...state,
      numberedDeck: { ...state.numberedDeck, cursor: 99 },
    };
    expect(validateGameState(corrupt)[0]?.code).toBe("INVALID_DECK_STATE");
    expect(
      decide(
        state,
        {
          type: "player.publicStateAdjusted",
          playerId: PLAYER_IDS[0] as PlayerId,
          patch: { improvements: { science: -1 as never } },
        },
        deps("invalid-edit"),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_PLAYER_STATE" },
    });
  });

  it("confirms a winner only after the public ledger reaches the target", () => {
    let state = actionPhase(newGame());
    const tooEarly = decide(
      state,
      { type: "game.completed", winnerId: PLAYER_IDS[0] as PlayerId },
      deps("winner-early"),
    );
    expect(tooEarly).toMatchObject({
      ok: false,
      error: { code: "WINNER_NOT_ELIGIBLE" },
    });
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYER_IDS[0] as PlayerId,
        patch: {
          scoreAdjustment: {
            delta: 10,
            reason: "manual",
          },
        },
      },
      "winner-score",
    );
    state = run(
      state,
      { type: "game.completed", winnerId: PLAYER_IDS[0] as PlayerId },
      "winner-confirm",
    );
    expect(state).toMatchObject({
      status: "completed",
      winnerId: PLAYER_IDS[0],
      turn: { phase: "completed" },
    });
  });
});

describe("deterministic replay", () => {
  it("produces identical revisions from identical state, commands, IDs, time, and randomness", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 60, maxLength: 100 }),
        (values) => {
          const random = () => {
            let index = 0;
            return (upperExclusive: number) => {
              const value = values[index % values.length] ?? 0;
              index += 1;
              return value % upperExclusive;
            };
          };
          const left = newGame({ random: random(), prefix: "deterministic" });
          const right = newGame({ random: random(), prefix: "deterministic" });
          expect(right).toEqual(left);
          const leftDecision = unwrap(
            decide(
              left,
              { type: "roll.draw" },
              deps("deterministic-roll", random()),
            ),
          );
          const rightDecision = unwrap(
            decide(
              right,
              { type: "roll.draw" },
              deps("deterministic-roll", random()),
            ),
          );
          expect(rightDecision).toEqual(leftDecision);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("year changes from an early deck reshuffle", () => {
  /** Draw `count` numbered cards, walking through each turn's resolution. */
  function drawCards(state: GameState, count: number, prefix: string) {
    let current = state;
    for (let index = 0; index < count; index += 1) {
      current = run(current, { type: "roll.draw" }, `${prefix}-roll-${index}`);
      const rollId = current.lastRoll?.id as never;
      if (current.resolution.official?.progressPending) {
        current = run(
          current,
          { type: "resolution.progressAcknowledged", rollId },
          `${prefix}-prog-${index}`,
        );
      }
      if (current.resolution.official?.productionPending) {
        current = run(
          current,
          { type: "resolution.productionAcknowledged", rollId },
          `${prefix}-prod-${index}`,
        );
      }
      if (current.turn.phase === "resolving-thematic-event") {
        const occurrenceId = current.thematicEvents.pendingEvent
          ?.occurrenceId as never;
        current = run(
          current,
          { type: "event.acknowledged", occurrenceId },
          `${prefix}-event-${index}`,
        );
      }
      if (current.turn.phase === "action-phase") {
        current = run(
          current,
          { type: "turn.ended" },
          `${prefix}-end-${index}`,
        );
      }
    }
    return current;
  }

  it("plays a full 36-card year when the threshold is off", () => {
    const state = newGame({
      setup: setup({ numberedReshuffleThreshold: 0 }),
      prefix: "year-off",
    });
    const played = drawCards(state, 36, "year-off");
    expect(played.numberedDeck.cycle).toBe(1);
    expect(played.history.yearChanges ?? []).toEqual([]);
    expect(played.lastYearChange ?? null).toBeNull();
  });

  it("starts year two at card 32 and records the skipped cards", () => {
    const state = newGame({
      setup: setup({ numberedReshuffleThreshold: 4 }),
      prefix: "year-four",
    });
    const expectedSkipped = state.numberedDeck.order.slice(32);

    const beforeBoundary = drawCards(state, 32, "year-four");
    expect(beforeBoundary.numberedDeck.cycle).toBe(1);
    expect(beforeBoundary.history.yearChanges ?? []).toEqual([]);

    const afterBoundary = drawCards(beforeBoundary, 1, "year-four-boundary");
    expect(afterBoundary.numberedDeck.cycle).toBe(2);

    const changes = afterBoundary.history.yearChanges ?? [];
    expect(changes).toHaveLength(1);
    expect(changes[0]?.cycle).toBe(2);
    expect(changes[0]?.skipped).toEqual(expectedSkipped);
    expect(afterBoundary.lastYearChange?.cycle).toBe(2);
    expect(afterBoundary.lastYearChange?.skipped).toHaveLength(4);
  });

  it("keeps the year change out of alchemy rolls", () => {
    const state = newGame({
      setup: setup({ numberedReshuffleThreshold: 4 }),
      prefix: "year-alchemy",
    });
    const played = drawCards(state, 32, "year-alchemy");
    const alchemy = run(
      played,
      { type: "roll.alchemy", red: 3, yellow: 4 },
      "year-alchemy-roll",
    );
    // Alchemy preserves the deck cursor, so no year boundary is crossed.
    expect(alchemy.numberedDeck.cycle).toBe(1);
    expect(alchemy.history.yearChanges ?? []).toEqual([]);
  });
});
