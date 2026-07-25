/**
 * Seasons Mode — an optional house-rule layer over World Events.
 *
 * Seasons change only at round boundaries. The current season is derived
 * purely from setup configuration and the current round number — no mutable
 * season state is required.
 *
 * Seasonal identity biases World Event selection through category weighting
 * without ever making a category impossible.
 */

import type {
  BoundedIntSource,
  EventId,
  RandomSource,
  WorldEventCategory,
} from "./types";
import { toBoundedInt } from "./random";
import type { WorldEventDefinition } from "./worldEvents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Season = "spring" | "summer" | "autumn" | "winter";

export type RoundsPerSeason = 2 | 3 | 4;

export interface SeasonConfig {
  enabled: boolean;
  roundsPerSeason: RoundsPerSeason;
  startingSeason: Season;
}

export const SEASONS: readonly Season[] = [
  "spring",
  "summer",
  "autumn",
  "winter",
];

export const DEFAULT_SEASON_CONFIG: SeasonConfig = {
  enabled: false,
  roundsPerSeason: 3,
  startingSeason: "spring",
};

// ---------------------------------------------------------------------------
// Season derivation — pure function, no mutable state
// ---------------------------------------------------------------------------

export interface SeasonInfo {
  season: Season;
  roundInSeason: number;
  seasonCycle: number;
}

/**
 * Derive the current season from setup configuration and round number.
 * Round 1 is always in the starting season.
 */
export function deriveSeason(config: SeasonConfig, round: number): SeasonInfo {
  const startIndex = SEASONS.indexOf(config.startingSeason);
  const zeroBasedRound = round - 1;
  const totalSeasonsPassed = Math.floor(
    zeroBasedRound / config.roundsPerSeason,
  );
  const seasonIndex = (startIndex + totalSeasonsPassed) % 4;
  const roundInSeason = (zeroBasedRound % config.roundsPerSeason) + 1;
  const seasonCycle = Math.floor(totalSeasonsPassed / 4) + 1;

  return {
    season: SEASONS[seasonIndex]!,
    roundInSeason,
    seasonCycle,
  };
}

/**
 * Detect whether advancing from prevRound to newRound crosses a season boundary.
 */
export function isSeasonTransition(
  config: SeasonConfig,
  prevRound: number,
  newRound: number,
): boolean {
  if (!config.enabled || prevRound === newRound) return false;
  return (
    deriveSeason(config, prevRound).season !==
    deriveSeason(config, newRound).season
  );
}

// ---------------------------------------------------------------------------
// Seasonal category weighting
// ---------------------------------------------------------------------------

/** Weight values from the design proposal. */
const WEIGHT_FAVORED = 1.5;
const WEIGHT_NEUTRAL = 1.0;
const WEIGHT_REDUCED = 0.5;

/** Hard minimum: even if reduced, never below this. */
export const WEIGHT_HARD_MIN = 0.25;

/**
 * Season → category weights.
 *
 * Pack name mapping:
 *   Weather & Harvest  → nature
 *   Trade & Markets    → economy
 *   Conflict & Defense → military
 *   Diplomacy & Intrigue → diplomacy
 *   Festivals & Progress → society
 */
export const SEASON_WEIGHTS: Readonly<
  Record<Season, Readonly<Record<WorldEventCategory, number>>>
> = {
  spring: {
    nature: WEIGHT_FAVORED, // Weather & Harvest
    diplomacy: WEIGHT_FAVORED, // Diplomacy & Intrigue
    economy: WEIGHT_NEUTRAL, // Trade & Markets
    society: WEIGHT_NEUTRAL, // Festivals & Progress
    military: WEIGHT_REDUCED, // Conflict & Defense
  },
  summer: {
    economy: WEIGHT_FAVORED, // Trade & Markets
    military: WEIGHT_FAVORED, // Conflict & Defense
    diplomacy: WEIGHT_NEUTRAL,
    society: WEIGHT_NEUTRAL,
    nature: WEIGHT_REDUCED, // Weather & Harvest
  },
  autumn: {
    nature: WEIGHT_FAVORED, // Weather & Harvest
    society: WEIGHT_FAVORED, // Festivals & Progress
    economy: WEIGHT_NEUTRAL,
    military: WEIGHT_NEUTRAL,
    diplomacy: WEIGHT_REDUCED, // Diplomacy & Intrigue
  },
  winter: {
    military: WEIGHT_FAVORED, // Conflict & Defense
    diplomacy: WEIGHT_FAVORED, // Diplomacy & Intrigue
    economy: WEIGHT_REDUCED, // Trade & Markets
    nature: WEIGHT_NEUTRAL,
    society: WEIGHT_NEUTRAL,
  },
};

/**
 * Get the weight for a category in a given season.
 * Enforces the hard minimum.
 */
export function categoryWeight(
  season: Season,
  category: WorldEventCategory,
): number {
  return Math.max(SEASON_WEIGHTS[season][category], WEIGHT_HARD_MIN);
}

// ---------------------------------------------------------------------------
// Weighted event selection
// ---------------------------------------------------------------------------

/**
 * Create a seasonally weighted World Event order for the without-replacement deck.
 *
 * This replaces `createBalancedWorldEventOrder` when Seasons Mode is enabled.
 * It preserves all existing guardrails:
 * - Compatibility/prerequisite filtering happens before this function is called.
 * - Immediate-repeat prevention across deck cycles.
 * - Tone-run constraint (no 3+ consecutive same tone).
 * - Impact-3 anti-clump (no 2+ consecutive impact-3).
 *
 * The algorithm:
 * 1. Weighted shuffle: draw one at a time using seasonal weights.
 * 2. Post-process with the same guardrail repair used by the balanced order.
 * 3. Anti-repeat and impact-3 anti-clump across deck-cycle boundary.
 *
 * If only one pack is enabled (all events have the same category),
 * seasonal weighting has no effect — all weights are equal.
 */
export function createSeasonalWorldEventOrder(
  events: readonly WorldEventDefinition[],
  random: RandomSource | BoundedIntSource,
  previousEventId: EventId | null,
  season: Season,
): EventId[] {
  const remaining = [...events];
  const order: EventId[] = [];
  const recent: WorldEventDefinition[] =
    previousEventId === null
      ? []
      : events.filter((event) => event.id === previousEventId);

  while (remaining.length > 0) {
    const selected = selectSeasonalWorldEvent(
      remaining,
      random,
      recent,
      season,
    );
    order.push(selected);
    const selectedIndex = remaining.findIndex((event) => event.id === selected);
    const selectedDefinition = remaining[selectedIndex]!;
    recent.push(selectedDefinition);
    if (recent.length > 2) recent.shift();
    remaining.splice(selectedIndex, 1);
  }

  return order;
}

/**
 * Select the next event from the IDs still remaining in the current deck
 * cycle. This is called at trigger time so a season change affects the very
 * next event rather than only the next deck cycle.
 *
 * Existing balance guardrails outrank seasonal preference whenever another
 * valid candidate remains. Immediate-repeat prevention is applied across deck
 * cycle boundaries as well.
 */
export function selectSeasonalWorldEvent(
  events: readonly WorldEventDefinition[],
  random: RandomSource | BoundedIntSource,
  recentEvents: readonly WorldEventDefinition[],
  season: Season,
): EventId {
  if (events.length === 0) {
    throw new Error("Cannot select a seasonal World Event from an empty pool.");
  }

  const boundedInt = toBoundedInt(random);
  const previousEventId = recentEvents.at(-1)?.id ?? null;

  const nonRepeating =
    previousEventId !== null && events.length > 1
      ? events.filter((event) => event.id !== previousEventId)
      : [...events];
  const balanced = nonRepeating.filter((event) =>
    isValidPlacement(recentEvents, event),
  );
  const candidates = balanced.length > 0 ? balanced : nonRepeating;

  const enabledCategories = new Set(events.map((event) => event.category));
  const weights = candidates.map((event) =>
    enabledCategories.size === 1 ? 1 : categoryWeight(season, event.category),
  );
  return candidates[weightedSelect(weights, boundedInt)]!.id;
}

/** Maximum consecutive events allowed with the same tone. */
const MAX_CONSECUTIVE_SAME_TONE = 2;
/** Maximum consecutive high-impact (3) events. */
const MAX_CONSECUTIVE_HIGH_IMPACT = 1;

function isValidPlacement(
  placed: readonly WorldEventDefinition[],
  candidate: WorldEventDefinition,
): boolean {
  const len = placed.length;
  if (len >= MAX_CONSECUTIVE_SAME_TONE) {
    const allSameTone = Array.from(
      { length: MAX_CONSECUTIVE_SAME_TONE },
      (_, k) => placed[len - 1 - k]!.tone,
    ).every((tone) => tone === candidate.tone);
    if (allSameTone) return false;
  }
  if (candidate.impact === 3 && len >= MAX_CONSECUTIVE_HIGH_IMPACT) {
    const allHighImpact = Array.from(
      { length: MAX_CONSECUTIVE_HIGH_IMPACT },
      (_, k) => placed[len - 1 - k]!.impact,
    ).every((impact) => impact === 3);
    if (allHighImpact) return false;
  }
  return true;
}

/**
 * Select an index from a weights array using the bounded int source.
 * Uses integer arithmetic for determinism: multiply weights by 1000.
 */
function weightedSelect(
  weights: readonly number[],
  boundedInt: BoundedIntSource,
): number {
  // Scale to integers for deterministic selection
  const scaled = weights.map((w) => Math.round(w * 1000));
  const total = scaled.reduce((a, b) => a + b, 0);
  const roll = boundedInt(total);
  let cumulative = 0;
  for (let i = 0; i < scaled.length; i++) {
    cumulative += scaled[i]!;
    if (roll < cumulative) return i;
  }
  return scaled.length - 1;
}

// ---------------------------------------------------------------------------
// Season labels for UI
// ---------------------------------------------------------------------------

export const SEASON_LABELS: Readonly<Record<Season, string>> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

export const SEASON_ICONS: Readonly<Record<Season, string>> = {
  spring: "🌱",
  summer: "☀️",
  autumn: "🍂",
  winter: "❄️",
};
