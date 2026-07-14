import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
} from "../../domain";
import type { GameSetup } from "../../domain";
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

  it("accepts legacy states without a clock", () => {
    const result = createGame({
      gameId: asGameId("schema-legacy-game"),
      revisionId: asRevisionId("schema-legacy-revision"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: sequentialIds(),
    });
    if (!result.ok) throw new Error(result.error.message);
    const legacy = structuredClone(result.value.nextState);
    delete legacy.clock;

    expect(parseGameState(legacy)).toEqual(legacy);
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
    invalidDuration.clock!.totalActiveMs = -1;
    expect(() => parseGameState(invalidDuration)).toThrow();

    const invalidKeys = structuredClone(result.value.nextState);
    delete invalidKeys.clock!.playerActiveMs[invalidKeys.players[0]!.id];
    expect(() => parseGameState(invalidKeys)).toThrow();

    const invalidTimestamp = structuredClone(result.value.nextState);
    invalidTimestamp.clock!.runningSince = asIsoTimestamp("invalid");
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
    thematicCadence: "standard",
    thematicEventsEnabled: false,
    thematicEventCatalog: [],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}
