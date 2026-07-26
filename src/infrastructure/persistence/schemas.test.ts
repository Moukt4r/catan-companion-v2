import { describe, expect, it } from "vitest";
import {
  asEventId,
  asEventOccurrenceId,
  BUILT_IN_THEMATIC_EVENTS,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
} from "../../domain";
import type {
  ActiveWorldEventRecord,
  GameSetup,
  GameState,
  ThematicEventState,
} from "../../domain";
import { commandSchema, journalSchema, parseGameState } from "./schemas";

describe("persistence schemas", () => {
  it("rejects malformed game-state structures", () => {
    expect(() => parseGameState({ id: "only-an-id" })).toThrow(
      "Game state structure is invalid.",
    );
  });

  it("rejects structurally valid states that violate domain invariants", () => {
    const result = createGame({
      gameId: asGameId("schema-game"),
      revisionId: asRevisionId("schema-revision"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const invalid = structuredClone(result.value.nextState);
    invalid.turn.currentPlayerIndex = 99;

    expect(() => parseGameState(invalid)).toThrow();
  });

  it("returns validated states unchanged", () => {
    const result = createGame({
      gameId: asGameId("schema-valid-game"),
      revisionId: asRevisionId("schema-valid-revision"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);

    expect(parseGameState(result.value.nextState)).toEqual(
      result.value.nextState,
    );
    expect(result.value.nextState.clock).toBeDefined();
  });

  it("round-trips the recorded fact that an attack happened", () => {
    const result = createGame({
      gameId: asGameId("schema-board-attack-game"),
      revisionId: asRevisionId("schema-board-attack-revision"),
      createdAt: asIsoTimestamp("2026-07-25T05:15:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);
    state.barbarian = {
      ...state.barbarian,
      robberActivated: true,
      attacksCompleted: 1,
      history: [
        {
          proposalId: "schema-board-attack" as never,
          completedAt: asIsoTimestamp("2026-07-25T05:16:00.000Z"),
        },
      ],
    };

    expect(parseGameState(state).barbarian.history[0]).toEqual({
      proposalId: "schema-board-attack",
      completedAt: "2026-07-25T05:16:00.000Z",
    });
  });

  it("fully validates a present clock", () => {
    const result = createGame({
      gameId: asGameId("schema-clock-game"),
      revisionId: asRevisionId("schema-clock-revision"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const invalidDuration = structuredClone(result.value.nextState);
    invalidDuration.clock.totalActiveMs = -1;
    expect(() => parseGameState(invalidDuration)).toThrow();

    const invalidKeys = structuredClone(result.value.nextState);
    delete invalidKeys.clock.playerActiveMs[invalidKeys.players[0]!.id];
    expect(() => parseGameState(invalidKeys)).toThrow();

    const invalidTimestamp = structuredClone(result.value.nextState);
    invalidTimestamp.clock.runningSince = asIsoTimestamp("invalid");
    expect(() => parseGameState(invalidTimestamp)).toThrow();
  });

  it("roundtrips clock commands and journal summaries", () => {
    for (const type of [
      "clock.started",
      "clock.paused",
      "clock.resumed",
    ] as const) {
      expect(commandSchema.parse({ type })).toEqual({ type });
    }
    for (const kind of [
      "clock-started",
      "clock-paused",
      "clock-resumed",
    ] as const) {
      const summary = { kind, text: kind, playerIds: ["player"] };
      expect(journalSchema.parse(summary)).toEqual(summary);
    }
  });
});

function sequentialIds() {
  let value = 0;
  return {
    next(kind: string) {
      value += 1;
      return `${kind}-schema-${value}`;
    },
  };
}

function setup(): GameSetup {
  const players = ["a", "b", "c"].map((suffix, index) => ({
    id: asPlayerId(`schema-player-${suffix}`),
    name: `Player ${suffix}`,
    color: {
      id: `schema-color-${suffix}`,
      label: `Color ${suffix}`,
      hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
      distinguishabilityKey: `schema-key-${suffix}`,
    },
  }));
  return {
    title: "Schema test",
    mode: "standard",
    players,
    firstPlayerId: players[0]?.id ?? asPlayerId("missing"),
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: false,
    thematicEventCatalog: [],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

describe("legacy save backward compatibility", () => {
  it("parses v1 event definitions without metadata fields", () => {
    const result = createGame({
      gameId: asGameId("legacy-game"),
      revisionId: asRevisionId("legacy-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: {
        ...setup(),
        thematicEventPercent: 8,
        numberedReshuffleThreshold: 0,
        thematicEventsEnabled: true,
        thematicEventCatalog: [
          {
            id: asEventId("legacy-event-1"),
            contentVersion: 1,
            title: "Old Event",
            instruction: "Do something",
            // No tone/impact/category/scope/duration/compatibility
          },
        ],
      },
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = result.value.nextState;

    // Clone and re-parse — the v1 definition should survive
    const parsed = parseGameState(structuredClone(state));
    expect(parsed.thematicEvents.enabledEvents[0]!.title).toBe("Old Event");
    // Metadata should be absent (undefined)
    expect(parsed.thematicEvents.enabledEvents[0]!.tone).toBeUndefined();
  });

  it("parses v1 thematic snapshots without metadata in history", () => {
    const result = createGame({
      gameId: asGameId("legacy-snap"),
      revisionId: asRevisionId("legacy-snap-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);

    // Inject a v1-style snapshot (no tone/impact/etc.)
    state.history.thematicEvents = [
      {
        occurrenceId: asEventOccurrenceId("snap-1"),
        eventId: asEventId("old-event"),
        contentVersion: 1,
        title: "Old Snap",
        instruction: "Legacy instruction",
        triggeredAtCompletedTurn: 3,
        acknowledged: true,
      },
    ];

    const parsed = parseGameState(structuredClone(state));
    expect(parsed.history.thematicEvents[0]!.title).toBe("Old Snap");
  });

  it("rejects thematic state without an activeEvents field", () => {
    const result = createGame({
      gameId: asGameId("missing-active"),
      revisionId: asRevisionId("missing-active-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);

    const { activeEvents: removedActiveEvents, ...thematicWithoutActive } =
      state.thematicEvents;
    void removedActiveEvents;
    const invalidState = {
      ...state,
      thematicEvents: thematicWithoutActive,
    } as unknown as GameState;

    // activeEvents is required, so an absent field is a structural error
    // rather than something to silently tolerate.
    expect(() => parseGameState(invalidState)).toThrow();
  });

  it("parses active events with contentVersion defaulting to 1", () => {
    const result = createGame({
      gameId: asGameId("legacy-active"),
      revisionId: asRevisionId("legacy-active-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);

    // Inject an active event without contentVersion (simulating an early v2 save)
    type LegacyActiveEvent = Omit<ActiveWorldEventRecord, "contentVersion">;
    type LegacyThematicState = Omit<ThematicEventState, "activeEvents"> & {
      activeEvents: LegacyActiveEvent[];
    };
    const { activeEvents: removedActiveEvents, ...thematicWithoutActive } =
      state.thematicEvents;
    void removedActiveEvents;
    const legacyState: Omit<GameState, "thematicEvents"> & {
      thematicEvents: LegacyThematicState;
    } = {
      ...state,
      thematicEvents: {
        ...thematicWithoutActive,
        activeEvents: [
          {
            occurrenceId: asEventOccurrenceId("active-1"),
            eventId: asEventId("we-earthquake"),
            title: "Earthquake",
            instruction: "Shake",
            tone: "setback",
            impact: 2,
            category: "nature",
            scope: "all",
            duration: "until-resolved",
            compatibility: { twoPlayer: true },
            activeRound: null,
            triggeredAtCompletedTurn: 3,
            activated: true,
            // No contentVersion — should default to 1
          },
        ],
      },
    };

    const parsed = parseGameState(legacyState);
    const activeEvents = parsed.thematicEvents.activeEvents ?? [];
    expect(activeEvents).toHaveLength(1);
    expect(activeEvents[0]!.contentVersion).toBe(1);
  });
});

describe("season config persistence", () => {
  it("parses game state without seasonConfig (old saves)", () => {
    const result = createGame({
      gameId: asGameId("no-season-game"),
      revisionId: asRevisionId("no-season-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);

    expect(state.setup.seasonConfig).toBeUndefined();
    const parsed = parseGameState(state);
    expect(parsed.setup.seasonConfig).toBeUndefined();
  });

  it("round-trips seasonConfig when present", () => {
    const result = createGame({
      gameId: asGameId("season-game"),
      revisionId: asRevisionId("season-rev"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: {
        ...setup(),
        thematicEventPercent: 8,
        numberedReshuffleThreshold: 0,
        thematicEventsEnabled: true,
        thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
          ...event,
        })),
        seasonConfig: {
          enabled: true,
          roundsPerSeason: 4,
          startingSeason: "winter",
        },
      },
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const state = structuredClone(result.value.nextState);
    const parsed = parseGameState(state);
    expect(parsed.setup.seasonConfig).toEqual({
      enabled: true,
      roundsPerSeason: 4,
      startingSeason: "winter",
    });
  });
});
