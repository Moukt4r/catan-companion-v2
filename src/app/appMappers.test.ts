import { describe, expect, it } from "vitest";
import {
  colorNames,
  errorMessage,
  toHomeSummary,
  toImportPreview,
  toSavedGameSummary,
} from "./appMappers";
import type { StoredGame } from "../application";
import { asGameId, asPlayerId, type IsoTimestamp } from "../domain";

function fakeStoredGame(overrides?: Partial<StoredGame>): StoredGame {
  return {
    id: asGameId("game-1"),
    lifecycle: "active",
    title: "Sunday game",
    headRevisionId: "rev-1" as never,
    latestRevisionId: "rev-1" as never,
    redoStack: [],
    createdAt: "2026-07-01T10:00:00.000Z" as IsoTimestamp,
    updatedAt: "2026-07-01T12:00:00.000Z" as IsoTimestamp,
    players: [
      { id: asPlayerId("p1"), name: "Ada", colorHex: "#286b9b" },
      { id: asPlayerId("p2"), name: "Grace", colorHex: "#b43e3e" },
    ] as never,
    currentTurn: {
      playerId: asPlayerId("p1"),
      playerName: "Ada",
      round: 3,
      turnNumber: 7,
    } as never,
    gameDocumentVersion: 1,
    rulesDataVersion: "2025.1",
    ...overrides,
  };
}

describe("appMappers", () => {
  describe("errorMessage", () => {
    it("extracts message from Error instances", () => {
      expect(errorMessage(new Error("boom"))).toBe("boom");
    });

    it("returns a fallback for non-Error values", () => {
      expect(errorMessage("oops")).toBe("An unknown error occurred.");
      expect(errorMessage(null)).toBe("An unknown error occurred.");
    });
  });

  describe("colorNames", () => {
    it("maps all four player hex codes", () => {
      expect(Object.keys(colorNames)).toHaveLength(4);
      expect(colorNames["#b66a1f"]).toBe("Amber");
    });
  });

  describe("toHomeSummary", () => {
    it("maps a stored game to a home summary", () => {
      const summary = toHomeSummary(fakeStoredGame());
      expect(summary).toMatchObject({
        id: "game-1",
        title: "Sunday game",
        currentPlayerName: "Ada",
        currentPlayerColor: "#286b9b",
        round: 3,
        players: ["Ada", "Grace"],
      });
    });

    it("falls back to default color when current player is missing", () => {
      const game = fakeStoredGame({
        currentTurn: {
          playerId: asPlayerId("unknown"),
          playerName: "Ghost",
          round: 1,
          turnNumber: 1,
        } as never,
        players: [] as never,
      });
      const summary = toHomeSummary(game);
      expect(summary.currentPlayerColor).toBe("#286b9b");
    });
  });

  describe("toSavedGameSummary", () => {
    it("maps a completed game with winner", () => {
      const game = fakeStoredGame({
        lifecycle: "completed",
        winnerId: asPlayerId("p2"),
      });
      const summary = toSavedGameSummary(game);
      expect(summary.status).toBe("completed");
      expect(summary.winnerName).toBe("Grace");
      expect(summary.turns).toBe(6);
    });

    it("maps an archived game without winner", () => {
      const game = fakeStoredGame({ lifecycle: "archived" });
      const summary = toSavedGameSummary(game);
      expect(summary.status).toBe("archived");
      expect(summary.winnerName).toBeUndefined();
    });
  });

  describe("toImportPreview", () => {
    it("returns null for null input", () => {
      expect(toImportPreview(null)).toBeNull();
    });

    it("maps a valid preview", () => {
      const result = toImportPreview({
        title: "Import game",
        playerNames: ["Ada", "Grace"],
        completedTurns: 12,
        updatedAt: "2026-07-01T12:00:00.000Z" as IsoTimestamp,
        sourceApplicationVersion: "1.0.0",
      } as never);
      expect(result).toMatchObject({
        title: "Import game",
        players: ["Ada", "Grace"],
        turns: 12,
        status: "Validated backup",
      });
    });
  });
});
