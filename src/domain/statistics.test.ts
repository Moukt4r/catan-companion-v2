import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMATIC_EVENTS,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  buildGameStatistics,
  createGame,
  decide,
} from "./index";
import type {
  DomainDeps,
  DomainResult,
  GameSetup,
  GameState,
  IdSource,
  PlayerId,
} from "./types";

const PLAYER_IDS = [
  asPlayerId("player-a"),
  asPlayerId("player-b"),
  asPlayerId("player-c"),
];

const NOW = asIsoTimestamp("2026-07-28T20:00:00Z");

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
    at: asIsoTimestamp("2026-07-28T19:00:00Z"),
    revisionId: asRevisionId(`revision-${prefix}`),
    random: () => 0,
    ids: idSource(`command-${prefix}`),
  };
}

function setup(): GameSetup {
  return {
    title: "Statistics test",
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
    thematicEventPercent: 0,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: false,
    thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
      ...event,
    })),
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function newGame(prefix = "stats"): GameState {
  return unwrap(
    createGame({
      gameId: asGameId(`game-${prefix}`),
      revisionId: asRevisionId(`revision-${prefix}`),
      createdAt: asIsoTimestamp("2026-07-28T18:00:00Z"),
      setup: setup(),
      random: () => 0,
      ids: idSource(prefix),
    }),
  ).nextState;
}

/**
 * Plays `count` rolls, resolving each fully so the next can start.
 *
 * A roll can require a progress step before production is acknowledged, so both
 * are attempted in order. Skipping the progress step silently stalls the loop
 * after a couple of turns.
 */
function playRolls(state: GameState, count: number): GameState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    const rolled = decide(
      current,
      { type: "roll.draw" },
      deps(`roll-${index}`),
    );
    if (!rolled.ok) break;
    current = rolled.value.nextState;

    const roll = current.lastRoll;
    if (roll) {
      const progress = decide(
        current,
        { type: "resolution.progressAcknowledged", rollId: roll.id },
        deps(`progress-${index}`),
      );
      if (progress.ok) current = progress.value.nextState;

      const production = decide(
        current,
        { type: "resolution.productionAcknowledged", rollId: roll.id },
        deps(`ack-${index}`),
      );
      if (production.ok) current = production.value.nextState;
    }
    const ended = decide(current, { type: "turn.ended" }, deps(`end-${index}`));
    if (ended.ok) current = ended.value.nextState;
  }
  return current;
}

describe("game statistics", () => {
  it("reports nothing rolled without inventing numbers", () => {
    const report = buildGameStatistics(newGame("empty"), NOW);

    expect(report.totalRolls).toBe(0);
    // A mean of zero would be a lie; there is no mean of no rolls.
    expect(report.averageTotal).toBeNull();
    expect(report.mostCommonTotal).toBeNull();
    expect(report.rarestRolledTotal).toBeNull();
    // Every total is still listed so a chart has a stable shape.
    expect(report.diceTotals).toHaveLength(11);
    expect(report.diceTotals.every((entry) => entry.count === 0)).toBe(true);
    expect(report.diceTotals.every((entry) => entry.share === 0)).toBe(true);
  });

  it("counts every total and compares it with a fair deck", () => {
    const state = playRolls(newGame("totals"), 12);
    const report = buildGameStatistics(state, NOW);

    expect(report.totalRolls).toBe(12);
    // The counted totals must add up to the rolls actually made.
    const counted = report.diceTotals.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(counted).toBe(report.totalRolls);

    // Expected frequencies follow the 36-outcome distribution, so a seven is
    // expected six times as often as a two over the same number of rolls.
    const two = report.diceTotals.find((entry) => entry.total === 2);
    const seven = report.diceTotals.find((entry) => entry.total === 7);
    expect(seven?.expected).toBeCloseTo((two?.expected ?? 0) * 6, 10);

    for (const entry of report.diceTotals) {
      expect(entry.deviation).toBeCloseTo(entry.count - entry.expected, 10);
    }
  });

  it("splits rolls per player without double counting", () => {
    const state = playRolls(newGame("players"), 9);
    const report = buildGameStatistics(state, NOW);

    expect(report.players).toHaveLength(3);
    const perPlayer = report.players.reduce(
      (sum, player) => sum + player.rolls,
      0,
    );
    expect(perPlayer).toBe(report.totalRolls);

    for (const player of report.players) {
      if (player.rolls === 0) {
        expect(player.averageTotal).toBeNull();
        continue;
      }
      expect(player.averageTotal).toBeCloseTo(
        player.pipTotal / player.rolls,
        10,
      );
      // Luck is measured against a fair seven per roll, so it is signed.
      expect(player.luckIndex).toBe(player.pipTotal - player.rolls * 7);
    }
  });

  it("separates alchemy rolls from ordinary ones", () => {
    let state = playRolls(newGame("alchemy"), 3);
    const chosen = decide(
      state,
      { type: "roll.alchemy", red: 5, yellow: 4 },
      deps("alchemy"),
    );
    if (chosen.ok) state = chosen.value.nextState;

    const report = buildGameStatistics(state, NOW);

    expect(report.normalRolls + report.alchemyRolls).toBe(report.totalRolls);
    if (chosen.ok) {
      expect(report.alchemyRolls).toBe(1);
      const roller = report.players.find((player) => player.alchemyRolls > 0);
      expect(roller?.alchemyRolls).toBe(1);
    }
  });

  it("builds a running score timeline that ends on the real score", () => {
    const state = playRolls(newGame("timeline"), 6);
    const report = buildGameStatistics(state, NOW);

    expect(report.scoreTimeline.length).toBeGreaterThan(0);

    // The last point per player must match the score shown everywhere else,
    // otherwise the chart and the scoreboard would disagree.
    for (const player of report.players) {
      const points = report.scoreTimeline.filter(
        (point) => point.playerId === player.playerId,
      );
      const last = points.at(-1);
      if (last) {
        expect(last.score).toBe(player.victoryPoints);
      }
    }
  });

  it("keeps event-face counts consistent with the roll count", () => {
    const state = playRolls(newGame("faces"), 10);
    const report = buildGameStatistics(state, NOW);

    const counted = report.eventFaces.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(counted).toBe(report.totalRolls);
    for (const entry of report.eventFaces) {
      expect(entry.share).toBeCloseTo(entry.count / report.totalRolls, 10);
    }
  });

  it("groups world events without dropping ones that predate categories", () => {
    const state = newGame("events");
    const withLegacy: GameState = {
      ...state,
      history: {
        ...state.history,
        thematicEvents: [
          {
            occurrenceId: "occ-1" as never,
            eventId: "event-1" as never,
            contentVersion: 1,
            title: "Legacy",
            instruction: "No category recorded",
            triggeredAtCompletedTurn: 1,
            acknowledged: true,
          },
          {
            occurrenceId: "occ-2" as never,
            eventId: "event-2" as never,
            contentVersion: 2,
            title: "Modern",
            instruction: "Categorised",
            triggeredAtCompletedTurn: 2,
            acknowledged: true,
            category: "nature",
          },
        ],
      },
    };

    const report = buildGameStatistics(withLegacy, NOW);
    const counted = report.worldEventsByCategory.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    // Both events are represented; the legacy one is grouped, not discarded.
    expect(counted).toBe(2);
    expect(
      report.worldEventsByCategory.some(
        (entry) => entry.category === "unknown",
      ),
    ).toBe(true);
  });
});
