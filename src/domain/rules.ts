import type {
  EventFace,
  ImprovementLevel,
  ProgressDiscipline,
  ThematicCadence,
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

export const THEMATIC_TRIGGER_BAG_SIZE: Readonly<
  Record<ThematicCadence, number>
> = {
  subtle: 18,
  standard: 12,
  lively: 8,
};

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
