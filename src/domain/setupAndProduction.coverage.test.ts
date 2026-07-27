/**
 * Coverage for two validation branches that gameplay-level fixtures miss.
 *
 * Both are real rules rather than defensive guards: Seasons Mode refuses a
 * custom World Events catalog, and board validation warns when number tokens
 * are distributed so unevenly that one resource is far richer than another.
 */
import { describe, expect, it } from "vitest";
import {
  asBoardDesignId,
  asEventId,
  asIsoTimestamp,
  asPlayerId,
  BOARD_DOCUMENT_VERSION,
  createEmptyBoardInventory,
  validateBoardDesign,
  validateSetup,
  type BoardDesign,
  type BoardHex,
} from "./index";
import type { GameSetup } from "./types";

const PLAYERS = [
  asPlayerId("seasons-player-a"),
  asPlayerId("seasons-player-b"),
  asPlayerId("seasons-player-c"),
];

/** A definition copied from the built-in catalog, which Seasons Mode requires. */
const BUILT_IN_EVENT = {
  id: asEventId("we-good-harvest"),
  contentVersion: 1,
  title: "Good Harvest",
  instruction:
    "Each player chooses one resource type and takes one of that resource from the bank.",
};

describe("Seasons Mode catalog validation", () => {
  it("accepts Seasons Mode with the built-in typed catalog", () => {
    // Enabled World Events also require a non-empty catalog, so this uses a
    // real built-in definition rather than an empty list.
    const errors = validateSetup(seasonsSetup([BUILT_IN_EVENT]));
    expect(errors).toEqual([]);
  });

  it("rejects Seasons Mode when the catalog contains a custom event", () => {
    const errors = validateSetup(
      seasonsSetup([
        BUILT_IN_EVENT,
        {
          id: asEventId("custom-homebrew-event"),
          contentVersion: 1,
          title: "Homebrew",
          instruction: "Not part of the built-in catalog.",
        },
      ]),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: "INVALID_SETUP",
        message:
          "Seasons Mode only supports the built-in typed World Events catalog.",
      }),
    );
  });
});

describe("uneven resource production warning", () => {
  it("warns when average pips per resource vary sharply", () => {
    // forest averages 5 pips (a 6), pasture 1 (a 2) and fields 3 (a 4).
    // The 4-pip spread is well past the 2.5 threshold.
    const design = designWithTokens([
      ["forest", 6],
      ["pasture", 2],
      ["fields", 4],
    ]);
    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({ code: "uneven-resource-production" }),
    );
  });

  it("stays quiet when production is balanced across resources", () => {
    const design = designWithTokens([
      ["forest", 5],
      ["pasture", 4],
      ["fields", 9],
    ]);
    expect(validateBoardDesign(design)).not.toContainEqual(
      expect.objectContaining({ code: "uneven-resource-production" }),
    );
  });
});

function seasonsSetup(catalog: GameSetup["thematicEventCatalog"]): GameSetup {
  return {
    title: "Seasons validation",
    mode: "standard",
    players: PLAYERS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `seasons-color-${index}`,
        label: `Color ${index}`,
        hex: ["#cc0000", "#0055cc", "#118833"][index]!,
        distinguishabilityKey: `seasons-key-${index}`,
      },
    })),
    firstPlayerId: PLAYERS[0]!,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: true,
    thematicEventCatalog: catalog,
    seasonConfig: {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    },
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

function designWithTokens(
  entries: readonly [BoardHex["terrain"], BoardHex["numberToken"]][],
): BoardDesign {
  const hexes: BoardHex[] = entries.map(([terrain, numberToken], index) => ({
    coordinate: { q: index, r: 0 },
    terrain,
    numberToken,
  }));
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("board-production-spread"),
    revision: 0,
    name: "Production spread",
    createdAt: asIsoTimestamp("2026-07-26T00:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-26T00:00:00.000Z"),
    inventory: createEmptyBoardInventory(),
    footprint: hexes.map((hex) => hex.coordinate),
    hexes,
    ports: [],
  };
}
