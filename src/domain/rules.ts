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

function legacyThematicEvent(
  id: string,
  title: string,
  instruction: string,
  contentVersion = 1,
): ThematicEventDefinition {
  return {
    id: id as ThematicEventDefinition["id"],
    contentVersion,
    title,
    instruction,
  };
}

// Mirrors the canonical catalog from the predecessor repository's utils/events.ts.
export const BUILT_IN_THEMATIC_EVENTS: readonly ThematicEventDefinition[] = [
  legacyThematicEvent(
    "event-earthquake",
    "Earthquake!",
    "All players must remove one road from their network.",
  ),
  legacyThematicEvent(
    "event-good-harvest",
    "Good Harvest",
    "Each player receives one resource of their choice.",
  ),
  legacyThematicEvent(
    "event-trade-winds",
    "Trade Winds",
    "Maritime trade costs are reduced by 1 for the next round.",
  ),
  legacyThematicEvent(
    "event-pirates",
    "Pirates!",
    "Players with more than 7 cards must discard one resource.",
  ),
  legacyThematicEvent(
    "event-market-day",
    "Market Day",
    "All players may make one 2:1 trade with the bank.",
    2,
  ),
  legacyThematicEvent(
    "event-storm",
    "Storm",
    "No maritime trade allowed for one round.",
  ),
  legacyThematicEvent(
    "event-discovery",
    "Discovery",
    "Draw one development card at half cost.",
  ),
  legacyThematicEvent(
    "event-rebellion",
    "Rebellion",
    "Longest road is temporarily broken - no bonus points this round.",
  ),
  legacyThematicEvent(
    "event-festival",
    "Festival",
    "Each player with a city receives one free resource.",
  ),
  legacyThematicEvent(
    "event-drought",
    "Drought",
    "Fields produce no grain this round.",
  ),
  legacyThematicEvent(
    "event-time-of-abundance",
    "Time of Abundance",
    "All resource production is doubled this round.",
  ),
  legacyThematicEvent(
    "event-peace-treaty",
    "Peace Treaty",
    "Robber cannot be moved this round.",
  ),
  legacyThematicEvent(
    "event-innovation",
    "Innovation",
    "First city upgrade this round costs 1 less resource.",
  ),
  legacyThematicEvent(
    "event-epidemic",
    "Epidemic",
    "Cities produce resources as settlements this round.",
  ),
  legacyThematicEvent(
    "event-progress",
    "Progress",
    "Each player may upgrade one road for free.",
  ),
  legacyThematicEvent(
    "event-dense-fog",
    "Dense Fog",
    "No robber movement allowed this round.",
  ),
  legacyThematicEvent(
    "event-resource-windfall",
    "Resource Windfall",
    "Roll one die - all players get that resource.",
  ),
  legacyThematicEvent(
    "event-tax-collection",
    "Tax Collection",
    "Players with more than 5 victory points must give away 1 resource.",
  ),
  legacyThematicEvent(
    "event-good-fortune",
    "Good Fortune",
    "Next 7 rolled does not trigger robber.",
  ),
  legacyThematicEvent(
    "event-sabotage",
    "Sabotage",
    "Each player must disable one production hex for one round.",
  ),
  legacyThematicEvent(
    "event-celebration",
    "Celebration",
    "Development cards cost 1 less resource this round.",
  ),
  legacyThematicEvent(
    "event-diplomacy",
    "Diplomacy",
    "Players cannot play soldier cards this round.",
  ),
  legacyThematicEvent(
    "event-creative-solutions",
    "Creative Solutions",
    "Players may use any resource as a wildcard once this round.",
  ),
  legacyThematicEvent(
    "event-raider-attack",
    "Raider Attack",
    "Players with settlements on 6 or 8 lose one resource.",
  ),
  legacyThematicEvent(
    "event-cooperation",
    "Cooperation",
    "All trades between players cost no resources this round.",
  ),
  legacyThematicEvent(
    "event-competition",
    "Competition",
    "No trades between players allowed this round.",
  ),
  legacyThematicEvent(
    "event-ancient-wisdom",
    "Ancient Wisdom",
    "Development cards can be played immediately after purchase.",
  ),
  legacyThematicEvent(
    "event-mystical-event",
    "Mystical Event",
    "Reshuffle all unplayed development cards.",
  ),
  legacyThematicEvent(
    "event-investment",
    "Investment",
    "Players may buy victory points for 5 resources each.",
  ),
  legacyThematicEvent(
    "event-isolation",
    "Isolation",
    "No new roads can be built this round.",
  ),
];
