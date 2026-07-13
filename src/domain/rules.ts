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

export const BUILT_IN_THEMATIC_EVENTS: readonly ThematicEventDefinition[] = [
  {
    id: "event-harbor-festival" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Harbor Festival",
    instruction:
      "Until this turn ends, announce each maritime trade as part of the harbor festival.",
  },
  {
    id: "event-surveyors-call" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Surveyor's Call",
    instruction:
      "Before continuing, each player points out one route they hope to develop.",
  },
  {
    id: "event-market-day" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Market Day",
    instruction:
      "Open the action phase with one round of table-wide trade offers.",
  },
  {
    id: "event-city-bells" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "City Bells",
    instruction:
      "Pause briefly and have the current player recap the public state of the cities.",
  },
  {
    id: "event-favorable-winds" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Favorable Winds",
    instruction:
      "The current player may make one bank trade at a 3:1 rate during this action phase.",
  },
  {
    id: "event-builders-truce" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Builders' Truce",
    instruction:
      "No player may interrupt the current action phase with table talk until one build or trade is complete.",
  },
  {
    id: "event-open-ledger" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Open Ledger",
    instruction:
      "Each player states only their public victory-point total before the action phase continues.",
  },
  {
    id: "event-traveling-broker" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Traveling Broker",
    instruction:
      "The current player may offer one two-card-for-two-card trade to the whole table before any other action.",
  },
  {
    id: "event-watch-fires" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Watch Fires",
    instruction:
      "Review every active knight at the physical board and correct the companion if needed.",
  },
  {
    id: "event-civic-pride" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Civic Pride",
    instruction:
      "Every player with a city names the city improvement they most want to advance.",
  },
  {
    id: "event-quiet-market" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Quiet Market",
    instruction:
      "The next trade offer must be stated once and answered only with yes, no, or a counteroffer.",
  },
  {
    id: "event-roadside-feast" as ThematicEventDefinition["id"],
    contentVersion: 1,
    title: "Roadside Feast",
    instruction:
      "Before ending the turn, the current player thanks another player for one memorable trade or rivalry.",
  },
];
