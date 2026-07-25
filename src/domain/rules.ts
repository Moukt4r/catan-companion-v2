import type {
  EventFace,
  ImprovementLevel,
  ProgressDiscipline,
  ThematicEventDefinition,
} from "./types";

export const DEFAULT_BARBARIAN_TRACK_LENGTH = 7;
export const DEFAULT_KNIGHT_COMPONENT_LIMIT_PER_LEVEL = 2;

export const PROGRESS_ELIGIBILITY_2025: Readonly<
  Record<ImprovementLevel, readonly number[]>
> = {
  0: [],
  1: [1, 2],
  2: [1, 2, 3],
  3: [1, 2, 3, 4],
  4: [1, 2, 3, 4, 5],
  5: [1, 2, 3, 4, 5, 6],
};

export const EVENT_DECK_FACES: readonly EventFace[] = [
  "barbarian",
  "barbarian",
  "barbarian",
  "science",
  "trade",
  "politics",
];

export const DISCIPLINES: readonly ProgressDiscipline[] = [
  "science",
  "trade",
  "politics",
];

/**
 * Number of slots in the percent-based trigger bag. One slot is consumed per
 * eligible turn, so bag size 100 yields exact 1% granularity.
 */
export const THEMATIC_TRIGGER_BAG_SLOTS = 100;

/** Default World Event frequency for a fresh setup, in percent per turn. */
export const DEFAULT_THEMATIC_EVENT_PERCENT = 8;

/** Clamp any input to an integer percent within 0-100. */
export function clampThematicPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Minimum completed turns between two World Events.
 *
 * The historical fixed 2-turn gap silently caps high frequencies: at 100% it
 * would allow at most one event every third turn. The gap therefore relaxes as
 * the requested frequency rises, so the slider stays truthful.
 */
export function thematicCooldownTurns(percent: number): number {
  const clamped = clampThematicPercent(percent);
  if (clamped >= 50) {
    return 0;
  }
  if (clamped >= 25) {
    return 1;
  }
  return 2;
}

/** Largest allowed "cards remaining" reshuffle threshold for the 36-card deck. */
export const MAX_NUMBERED_RESHUFFLE_THRESHOLD = 12;

/** Clamp a numbered-deck reshuffle threshold to a supported integer value. */
export function clampNumberedReshuffleThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(
    MAX_NUMBERED_RESHUFFLE_THRESHOLD,
    Math.max(0, Math.round(value)),
  );
}

import { WORLD_EVENTS_CATALOG, toThematicDefinition } from "./worldEvents";

/**
 * The built-in thematic event catalog, projected from the typed World Events
 * catalog to the persistence-compatible ThematicEventDefinition shape.
 *
 * This replaces the legacy 30-event catalog with a curated set of 20
 * coherent, balanced, lifecycle-aware events.
 */
export const BUILT_IN_THEMATIC_EVENTS: readonly ThematicEventDefinition[] =
  WORLD_EVENTS_CATALOG.map(toThematicDefinition);

/**
 * Legacy event catalog for migration purposes.
 * Existing saves may reference these event IDs.
 */
export const LEGACY_EVENT_IDS: readonly string[] = [
  "event-earthquake",
  "event-good-harvest",
  "event-trade-winds",
  "event-pirates",
  "event-market-day",
  "event-storm",
  "event-discovery",
  "event-rebellion",
  "event-festival",
  "event-drought",
  "event-time-of-abundance",
  "event-peace-treaty",
  "event-innovation",
  "event-epidemic",
  "event-progress",
  "event-dense-fog",
  "event-resource-windfall",
  "event-tax-collection",
  "event-good-fortune",
  "event-sabotage",
  "event-celebration",
  "event-diplomacy",
  "event-creative-solutions",
  "event-raider-attack",
  "event-cooperation",
  "event-competition",
  "event-ancient-wisdom",
  "event-mystical-event",
  "event-investment",
  "event-isolation",
];
