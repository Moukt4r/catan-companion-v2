import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
} from "../domain";
import type { GameSetup } from "../domain";
import { storedGameFromState } from "./records";

describe("storedGameFromState", () => {
  it("summarizes completed and archived states without losing completion data", () => {
    let id = 0;
    const result = createGame({
      gameId: asGameId("records-game"),
      revisionId: asRevisionId("records-revision"),
      createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
      setup: setup(),
      random: () => 0,
      ids: {
        next: (kind) => {
          id += 1;
          return `${kind}-records-${id}`;
        },
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    const winnerId =
      result.value.nextState.players[0]?.id ?? asPlayerId("missing");
    const completed = {
      ...result.value.nextState,
      status: "completed" as const,
      winnerId,
    };

    expect(storedGameFromState(completed)).toMatchObject({
      lifecycle: "completed",
      completedAt: completed.updatedAt,
      winnerId,
    });
    expect(storedGameFromState(completed, "archived").lifecycle).toBe(
      "archived",
    );
  });
});

function setup(): GameSetup {
  const players = ["a", "b", "c"].map((suffix, index) => ({
    id: asPlayerId(`records-player-${suffix}`),
    name: `Player ${suffix}`,
    color: {
      id: `records-color-${suffix}`,
      label: `Color ${suffix}`,
      hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
      distinguishabilityKey: `records-key-${suffix}`,
    },
  }));
  return {
    title: "Records",
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
