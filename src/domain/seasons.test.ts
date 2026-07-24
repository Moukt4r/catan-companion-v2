import { describe, expect, it } from "vitest";
import {
  deriveSeason,
  isSeasonTransition,
  categoryWeight,
  createSeasonalWorldEventOrder,
  selectSeasonalWorldEvent,
  SEASONS,
  SEASON_WEIGHTS,
  SEASON_LABELS,
  SEASON_ICONS,
  WEIGHT_HARD_MIN,
  DEFAULT_SEASON_CONFIG,
  type Season,
  type SeasonConfig,
} from "./seasons";
import { WORLD_EVENTS_CATALOG } from "./worldEvents";
import type { WorldEventCategory } from "./types";

// Deterministic RNG for tests
function seededRng(seed: number) {
  let s = seed;
  return (upperExclusive: number): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % upperExclusive;
  };
}

// ---------------------------------------------------------------------------
// deriveSeason
// ---------------------------------------------------------------------------

describe("deriveSeason", () => {
  it("returns the starting season for round 1", () => {
    for (const season of SEASONS) {
      const config: SeasonConfig = {
        enabled: true,
        roundsPerSeason: 3,
        startingSeason: season,
      };
      expect(deriveSeason(config, 1).season).toBe(season);
      expect(deriveSeason(config, 1).roundInSeason).toBe(1);
      expect(deriveSeason(config, 1).seasonCycle).toBe(1);
    }
  });

  it("progresses through all four seasons with roundsPerSeason=3", () => {
    const config: SeasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    const expected: [number, Season, number][] = [
      [1, "spring", 1],
      [2, "spring", 2],
      [3, "spring", 3],
      [4, "summer", 1],
      [5, "summer", 2],
      [6, "summer", 3],
      [7, "autumn", 1],
      [8, "autumn", 2],
      [9, "autumn", 3],
      [10, "winter", 1],
      [11, "winter", 2],
      [12, "winter", 3],
      [13, "spring", 1], // second cycle
    ];
    for (const [round, season, roundInSeason] of expected) {
      const info = deriveSeason(config, round);
      expect(info.season).toBe(season);
      expect(info.roundInSeason).toBe(roundInSeason);
    }
  });

  it("handles roundsPerSeason=2", () => {
    const config: SeasonConfig = {
      enabled: true,
      roundsPerSeason: 2,
      startingSeason: "autumn",
    };
    expect(deriveSeason(config, 1).season).toBe("autumn");
    expect(deriveSeason(config, 2).season).toBe("autumn");
    expect(deriveSeason(config, 3).season).toBe("winter");
    expect(deriveSeason(config, 4).season).toBe("winter");
    expect(deriveSeason(config, 5).season).toBe("spring");
    expect(deriveSeason(config, 8).season).toBe("summer");
    expect(deriveSeason(config, 9).season).toBe("autumn"); // wraps
  });

  it("handles roundsPerSeason=4", () => {
    const config: SeasonConfig = {
      enabled: true,
      roundsPerSeason: 4,
      startingSeason: "winter",
    };
    expect(deriveSeason(config, 1).season).toBe("winter");
    expect(deriveSeason(config, 4).season).toBe("winter");
    expect(deriveSeason(config, 5).season).toBe("spring");
    expect(deriveSeason(config, 8).season).toBe("spring");
    expect(deriveSeason(config, 9).season).toBe("summer");
    expect(deriveSeason(config, 16).season).toBe("autumn");
    expect(deriveSeason(config, 17).season).toBe("winter"); // wraps
  });

  it("tracks season cycle correctly", () => {
    const config: SeasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    expect(deriveSeason(config, 1).seasonCycle).toBe(1);
    expect(deriveSeason(config, 12).seasonCycle).toBe(1);
    expect(deriveSeason(config, 13).seasonCycle).toBe(2);
    expect(deriveSeason(config, 24).seasonCycle).toBe(2);
    expect(deriveSeason(config, 25).seasonCycle).toBe(3);
  });

  it("works for every starting season with roundsPerSeason=3", () => {
    for (const start of SEASONS) {
      const config: SeasonConfig = {
        enabled: true,
        roundsPerSeason: 3,
        startingSeason: start,
      };
      const startIdx = SEASONS.indexOf(start);
      // After 4 full seasons (12 rounds), should cycle back
      expect(deriveSeason(config, 1).season).toBe(SEASONS[startIdx]);
      expect(deriveSeason(config, 4).season).toBe(SEASONS[(startIdx + 1) % 4]);
      expect(deriveSeason(config, 7).season).toBe(SEASONS[(startIdx + 2) % 4]);
      expect(deriveSeason(config, 10).season).toBe(SEASONS[(startIdx + 3) % 4]);
      expect(deriveSeason(config, 13).season).toBe(SEASONS[startIdx]);
    }
  });
});

// ---------------------------------------------------------------------------
// isSeasonTransition
// ---------------------------------------------------------------------------

describe("isSeasonTransition", () => {
  const config: SeasonConfig = {
    enabled: true,
    roundsPerSeason: 3,
    startingSeason: "spring",
  };

  it("returns false for same round", () => {
    expect(isSeasonTransition(config, 3, 3)).toBe(false);
  });

  it("returns false within same season", () => {
    expect(isSeasonTransition(config, 1, 2)).toBe(false);
    expect(isSeasonTransition(config, 2, 3)).toBe(false);
  });

  it("returns true at season boundary", () => {
    expect(isSeasonTransition(config, 3, 4)).toBe(true); // spring→summer
    expect(isSeasonTransition(config, 6, 7)).toBe(true); // summer→autumn
    expect(isSeasonTransition(config, 9, 10)).toBe(true); // autumn→winter
    expect(isSeasonTransition(config, 12, 13)).toBe(true); // winter→spring
  });

  it("returns false when seasons mode is disabled", () => {
    const disabled: SeasonConfig = { ...config, enabled: false };
    expect(isSeasonTransition(disabled, 3, 4)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// categoryWeight
// ---------------------------------------------------------------------------

describe("categoryWeight", () => {
  it("returns expected weights for spring", () => {
    expect(categoryWeight("spring", "nature")).toBe(1.5);
    expect(categoryWeight("spring", "diplomacy")).toBe(1.5);
    expect(categoryWeight("spring", "economy")).toBe(1.0);
    expect(categoryWeight("spring", "society")).toBe(1.0);
    expect(categoryWeight("spring", "military")).toBe(0.5);
  });

  it("never returns below the hard minimum", () => {
    for (const season of SEASONS) {
      const categories: WorldEventCategory[] = [
        "nature",
        "economy",
        "military",
        "diplomacy",
        "society",
      ];
      for (const cat of categories) {
        expect(categoryWeight(season, cat)).toBeGreaterThanOrEqual(
          WEIGHT_HARD_MIN,
        );
      }
    }
  });

  it("all seasons have exactly 2 favored, 2 neutral, 1 reduced", () => {
    for (const season of SEASONS) {
      const weights = SEASON_WEIGHTS[season];
      const values = Object.values(weights);
      expect(values.filter((w) => w === 1.5).length).toBe(2);
      expect(values.filter((w) => w === 1.0).length).toBe(2);
      expect(values.filter((w) => w === 0.5).length).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// createSeasonalWorldEventOrder
// ---------------------------------------------------------------------------

describe("createSeasonalWorldEventOrder", () => {
  it("returns all event IDs exactly once", () => {
    const order = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(42),
      null,
      "spring",
    );
    expect(order).toHaveLength(WORLD_EVENTS_CATALOG.length);
    expect(new Set(order).size).toBe(WORLD_EVENTS_CATALOG.length);
  });

  it("is deterministic with same seed", () => {
    const a = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(123),
      null,
      "summer",
    );
    const b = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(123),
      null,
      "summer",
    );
    expect(a).toEqual(b);
  });

  it("varies with different seeds", () => {
    const a = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(1),
      null,
      "autumn",
    );
    const b = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(999),
      null,
      "autumn",
    );
    expect(a).not.toEqual(b);
  });

  it("varies with different seasons (same seed)", () => {
    const spring = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(42),
      null,
      "spring",
    );
    const winter = createSeasonalWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(42),
      null,
      "winter",
    );
    // Different seasons should produce different orderings
    expect(spring).not.toEqual(winter);
  });

  it("avoids repeating the previous event at position 0", () => {
    const prevId = WORLD_EVENTS_CATALOG[0]!.id;
    for (let seed = 0; seed < 50; seed++) {
      const order = createSeasonalWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        prevId,
        "spring",
      );
      expect(order[0]).not.toBe(prevId);
    }
  });

  it("no category becomes impossible", () => {
    // With many seeds, every category should appear in the first half
    const categories = new Set<WorldEventCategory>();
    for (let seed = 0; seed < 100; seed++) {
      const order = createSeasonalWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
        "spring", // military is reduced in spring
      );
      const halfLen = Math.floor(order.length / 2);
      for (let i = 0; i < halfLen; i++) {
        const event = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i]);
        if (event) categories.add(event.category);
      }
    }
    // All 5 categories should appear in the first half across seeds
    expect(categories.size).toBe(5);
  });

  it("handles single-event list", () => {
    const single = WORLD_EVENTS_CATALOG.slice(0, 1);
    const order = createSeasonalWorldEventOrder(
      single,
      seededRng(42),
      null,
      "winter",
    );
    expect(order).toEqual([single[0]!.id]);
  });

  it("handles two-event list", () => {
    const two = WORLD_EVENTS_CATALOG.slice(0, 2);
    const order = createSeasonalWorldEventOrder(
      two,
      seededRng(42),
      null,
      "autumn",
    );
    expect(order).toHaveLength(2);
    expect(new Set(order).size).toBe(2);
  });

  it("rejects selection from an empty remaining pool", () => {
    expect(() => selectSeasonalWorldEvent([], () => 0, [], "spring")).toThrow(
      "empty pool",
    );
  });

  it("applies the active season to the next draw, not just deck creation", () => {
    const nature = WORLD_EVENTS_CATALOG.find(
      (event) => event.category === "nature",
    )!;
    const military = WORLD_EVENTS_CATALOG.find(
      (event) => event.category === "military",
    )!;
    const middleRoll = (upperExclusive: number) =>
      Math.floor(upperExclusive * 0.45);

    expect(
      selectSeasonalWorldEvent([nature, military], middleRoll, [], "spring"),
    ).toBe(nature.id);
    expect(
      selectSeasonalWorldEvent([nature, military], middleRoll, [], "summer"),
    ).toBe(military.id);
  });

  it("lets tone and impact guardrails outrank seasonal preference", () => {
    const setbacks = WORLD_EVENTS_CATALOG.filter(
      (event) => event.tone === "setback",
    );
    const nonSetback = WORLD_EVENTS_CATALOG.find(
      (event) => event.tone !== "setback" && event.impact !== 3,
    )!;
    const highImpacts = WORLD_EVENTS_CATALOG.filter(
      (event) => event.impact === 3,
    );
    const lowImpact = WORLD_EVENTS_CATALOG.find(
      (event) => event.impact !== 3 && event.id !== nonSetback.id,
    )!;

    expect(
      selectSeasonalWorldEvent(
        [setbacks[0]!, nonSetback],
        () => 0,
        [setbacks[1]!, setbacks[2]!],
        "spring",
      ),
    ).toBe(nonSetback.id);
    expect(
      selectSeasonalWorldEvent(
        [highImpacts[1]!, lowImpact],
        () => 0,
        [highImpacts[0]!],
        "winter",
      ),
    ).toBe(lowImpact.id);
  });

  it("avoids an immediate repeat across deck cycles when possible", () => {
    const previous = WORLD_EVENTS_CATALOG[0]!;
    const alternative = WORLD_EVENTS_CATALOG[1]!;
    expect(
      selectSeasonalWorldEvent(
        [previous, alternative],
        () => 0,
        [previous],
        "spring",
      ),
    ).toBe(alternative.id);
  });

  it("respects tone-run constraint (no 3+ consecutive same tone) in most cases", () => {
    let violations = 0;
    const trials = 30;
    for (let seed = 0; seed < trials; seed++) {
      const order = createSeasonalWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
        "summer",
      );
      for (let i = 2; i < order.length; i++) {
        const a = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i - 2]);
        const b = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i - 1]);
        const c = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i]);
        if (a && b && c && a.tone === b.tone && b.tone === c.tone) {
          violations++;
        }
      }
    }
    // Graceful degradation: near-end forced placements may violate,
    // but violations should be very rare overall.
    expect(violations).toBeLessThan(trials);
  });

  it("respects impact-3 anti-clump (no 2+ consecutive impact-3) in most cases", () => {
    let violations = 0;
    const trials = 30;
    for (let seed = 0; seed < trials; seed++) {
      const order = createSeasonalWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
        "winter",
      );
      for (let i = 1; i < order.length; i++) {
        const prev = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i - 1]);
        const curr = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i]);
        if (prev && curr && prev.impact === 3 && curr.impact === 3) {
          violations++;
        }
      }
    }
    expect(violations).toBeLessThan(trials);
  });

  it("favored categories statistically appear earlier", () => {
    // In spring, nature+diplomacy are favored. Over many seeds,
    // their average position should be lower than military (reduced).
    let favoredPositionSum = 0;
    let favoredCount = 0;
    let reducedPositionSum = 0;
    let reducedCount = 0;
    const trials = 200;

    for (let seed = 0; seed < trials; seed++) {
      const order = createSeasonalWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
        "spring",
      );
      for (let i = 0; i < order.length; i++) {
        const event = WORLD_EVENTS_CATALOG.find((e) => e.id === order[i]);
        if (!event) continue;
        if (event.category === "nature" || event.category === "diplomacy") {
          favoredPositionSum += i;
          favoredCount++;
        } else if (event.category === "military") {
          reducedPositionSum += i;
          reducedCount++;
        }
      }
    }

    const avgFavored = favoredPositionSum / favoredCount;
    const avgReduced = reducedPositionSum / reducedCount;
    // Favored categories should appear earlier on average
    expect(avgFavored).toBeLessThan(avgReduced);
  });
});

// ---------------------------------------------------------------------------
// Constants & labels
// ---------------------------------------------------------------------------

describe("season constants", () => {
  it("SEASONS has 4 entries", () => {
    expect(SEASONS).toHaveLength(4);
  });

  it("SEASON_LABELS covers all seasons", () => {
    for (const s of SEASONS) {
      expect(typeof SEASON_LABELS[s]).toBe("string");
    }
  });

  it("SEASON_ICONS covers all seasons", () => {
    for (const s of SEASONS) {
      expect(typeof SEASON_ICONS[s]).toBe("string");
    }
  });

  it("DEFAULT_SEASON_CONFIG is disabled", () => {
    expect(DEFAULT_SEASON_CONFIG.enabled).toBe(false);
  });
});
