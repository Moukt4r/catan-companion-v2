import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
} from "../../domain";
import type { GameSetup } from "../../domain";
import { parseGameState } from "./schemas";

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
