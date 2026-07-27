import { domainError, failure, success } from "./errors";
import { drawDeck } from "./decks";
import { fisherYates, toBoundedInt } from "./random";
import {
  THEMATIC_TRIGGER_BAG_SLOTS,
  clampThematicPercent,
  thematicCooldownTurns,
} from "./rules";
import {
  WORLD_EVENTS_CATALOG,
  createBalancedWorldEventOrder,
  createActiveWorldEventFromDefinition,
  pruneActiveEvents,
  type ActiveWorldEvent,
} from "./worldEvents";
import { deriveSeason, selectSeasonalWorldEvent } from "./seasons";
import type { Season, SeasonConfig } from "./seasons";
import type {
  ActiveWorldEventRecord,
  BoundedIntSource,
  DeckState,
  DomainResult,
  EventId,
  EventOccurrenceId,
  RandomSource,
  RevisionId,
  ThematicEventDefinition,
  ThematicEventSnapshot,
  ThematicEventState,
  TriggerToken,
} from "./types";

/**
 * Build the percent-based trigger bag.
 *
 * The bag always has {@link THEMATIC_TRIGGER_BAG_SLOTS} slots and contains
 * exactly `percent` trigger tokens, giving true 1% granularity. Tokens are
 * placed by stratified sampling — the bag is split into `percent` equal blocks
 * and one trigger is seeded at a random position inside each block — so events
 * stay evenly spread instead of clumping the way a plain shuffle allows.
 */
export function createTriggerBag(
  percent: number,
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  cycle = 1,
): DeckState<TriggerToken> {
  const slots = THEMATIC_TRIGGER_BAG_SLOTS;
  const triggers = clampThematicPercent(percent);
  const order: TriggerToken[] = Array.from({ length: slots }, () => ({
    trigger: false,
  }));

  if (triggers > 0) {
    const boundedInt = toBoundedInt(random);
    for (let block = 0; block < triggers; block += 1) {
      const start = Math.floor((block * slots) / triggers);
      const end = Math.floor(((block + 1) * slots) / triggers);
      const span = Math.max(1, end - start);
      const offset = boundedInt(span);
      const index = Math.min(slots - 1, start + offset);
      order[index] = { trigger: true };
    }
  }

  return {
    cycle,
    cursor: 0,
    order,
    createdAtRevision: revisionId,
  };
}

export function createThematicEventDeck(
  events: readonly ThematicEventDefinition[],
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  previousEventId: EventId | null,
  cycle = 1,
): DeckState<EventId> {
  // Attempt balanced ordering if all events are in the World Events catalog
  const worldCatalog = WORLD_EVENTS_CATALOG;
  const allWorldEvents = events.every((e) =>
    worldCatalog.some((we) => we.id === e.id),
  );

  let order: EventId[];
  if (allWorldEvents && events.length > 0) {
    const matchedEvents = events
      .map((e) => worldCatalog.find((we) => we.id === e.id)!)
      .filter(Boolean);
    order = createBalancedWorldEventOrder(
      matchedEvents,
      random,
      previousEventId,
    );
  } else {
    // Legacy fallback: simple shuffle with anti-repeat
    order = fisherYates(
      events.map((event) => event.id),
      random,
    );
    if (
      previousEventId !== null &&
      order.length > 1 &&
      order[0] === previousEventId
    ) {
      const replacementIndex = order.findIndex(
        (eventId) => eventId !== previousEventId,
      );
      if (replacementIndex > 0) {
        const first = order[0];
        order[0] = order[replacementIndex] as EventId;
        order[replacementIndex] = first;
      }
    }
  }

  return {
    cycle,
    cursor: 0,
    order,
    createdAtRevision: revisionId,
  };
}

function drawSeasonalThematicEvent(
  deck: DeckState<EventId>,
  events: readonly ThematicEventDefinition[],
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  previousEventId: EventId | null,
  season: Season,
): DomainResult<{
  value: EventId;
  deck: DeckState<EventId>;
  cycle: number;
  index: number;
}> {
  if (
    !Number.isInteger(deck.cursor) ||
    deck.cursor < 0 ||
    deck.cursor > deck.order.length ||
    deck.order.length === 0
  ) {
    return failure(
      domainError("DECK_STATE_CORRUPT", "Cannot draw from a corrupt deck.", {
        cycle: deck.cycle,
        cursor: deck.cursor,
        length: deck.order.length,
      }),
    );
  }

  const startingNewCycle = deck.cursor === deck.order.length;
  const activeDeck: DeckState<EventId> = startingNewCycle
    ? {
        cycle: deck.cycle + 1,
        cursor: 0,
        order: events.map((event) => event.id),
        createdAtRevision: revisionId,
      }
    : deck;
  const remainingIds = activeDeck.order.slice(activeDeck.cursor);
  const definitionsById = new Map(
    WORLD_EVENTS_CATALOG.map((event) => [event.id, event]),
  );
  const remainingDefinitions = remainingIds.flatMap((id) => {
    const definition = definitionsById.get(id);
    return definition === undefined ? [] : [definition];
  });
  if (remainingDefinitions.length !== remainingIds.length) {
    return failure(
      domainError(
        "INVALID_THEMATIC_STATE",
        "The seasonal event deck references unknown content.",
      ),
    );
  }

  const recentIds = startingNewCycle
    ? deck.order.slice(-2)
    : activeDeck.order.slice(
        Math.max(0, activeDeck.cursor - 2),
        activeDeck.cursor,
      );
  if (previousEventId !== null && recentIds.at(-1) !== previousEventId) {
    recentIds.push(previousEventId);
    if (recentIds.length > 2) recentIds.shift();
  }
  const recentDefinitions = recentIds.flatMap((id) => {
    const definition = definitionsById.get(id);
    return definition === undefined ? [] : [definition];
  });
  const selectedId = selectSeasonalWorldEvent(
    remainingDefinitions,
    random,
    recentDefinitions,
    season,
  );
  const selectedIndex = activeDeck.order.indexOf(selectedId, activeDeck.cursor);
  if (selectedIndex < activeDeck.cursor) {
    return failure(
      domainError(
        "INVALID_THEMATIC_STATE",
        "The selected seasonal event is not available in this deck cycle.",
        { eventId: selectedId },
      ),
    );
  }

  const order = [...activeDeck.order];
  [order[activeDeck.cursor], order[selectedIndex]] = [
    order[selectedIndex]!,
    order[activeDeck.cursor]!,
  ];
  return success({
    value: selectedId,
    cycle: activeDeck.cycle,
    index: activeDeck.cursor,
    deck: { ...activeDeck, order, cursor: activeDeck.cursor + 1 },
  });
}

export function createThematicState(
  enabled: boolean,
  percent: number,
  events: readonly ThematicEventDefinition[],
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
): ThematicEventState {
  const resolvedPercent = clampThematicPercent(percent);
  return {
    enabled,
    percent: resolvedPercent,
    enabledEvents: events.map((event) => ({ ...event })),
    triggerBag: createTriggerBag(resolvedPercent, random, revisionId),
    eventDeck: createThematicEventDeck(events, random, revisionId, null),
    deferredTrigger: false,
    lastTriggeredAtCompletedTurn: null,
    previousEventId: null,
    pendingEvent: null,
    activeEvents: [],
  };
}

export interface ThematicScheduleResult {
  state: ThematicEventState;
  event: ThematicEventSnapshot | null;
}

export function scheduleThematicEvent(
  state: ThematicEventState,
  completedTurns: number,
  playerCount: number,
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  occurrenceId: EventOccurrenceId,
  seasonConfig?: SeasonConfig,
  currentRound?: number,
): DomainResult<ThematicScheduleResult> {
  if (!state.enabled) {
    return success({ state, event: null });
  }
  if (state.pendingEvent !== null) {
    return failure(
      domainError(
        "INVALID_THEMATIC_STATE",
        "A thematic event is already pending.",
      ),
    );
  }
  if (state.enabledEvents.length === 0) {
    return failure(
      domainError(
        "INVALID_THEMATIC_STATE",
        "Thematic events are enabled without any event definitions.",
      ),
    );
  }

  const percent = clampThematicPercent(state.percent);
  if (percent === 0) {
    return success({ state, event: null });
  }

  const cooldown = thematicCooldownTurns(percent);
  const eligible =
    completedTurns >= playerCount &&
    (state.lastTriggeredAtCompletedTurn === null ||
      completedTurns - state.lastTriggeredAtCompletedTurn >= cooldown);

  let triggerBag = state.triggerBag;
  let shouldTrigger = state.deferredTrigger;

  if (!state.deferredTrigger) {
    const triggerDraw = drawDeck(triggerBag, (cycle) =>
      createTriggerBag(percent, random, revisionId, cycle),
    );
    if (!triggerDraw.ok) {
      return triggerDraw;
    }
    triggerBag = triggerDraw.value.deck;
    shouldTrigger = triggerDraw.value.value.trigger;
  }

  if (!shouldTrigger) {
    return success({
      state: { ...state, triggerBag, deferredTrigger: false },
      event: null,
    });
  }
  if (!eligible) {
    return success({
      state: { ...state, triggerBag, deferredTrigger: true },
      event: null,
    });
  }

  const enabledCategories = new Set(
    state.enabledEvents.flatMap((event) =>
      event.category === undefined ? [] : [event.category],
    ),
  );
  const eventDraw =
    seasonConfig?.enabled &&
    currentRound !== undefined &&
    enabledCategories.size > 1
      ? drawSeasonalThematicEvent(
          state.eventDeck,
          state.enabledEvents,
          random,
          revisionId,
          state.previousEventId,
          deriveSeason(seasonConfig, currentRound).season,
        )
      : drawDeck(state.eventDeck, (cycle) =>
          createThematicEventDeck(
            state.enabledEvents,
            random,
            revisionId,
            state.previousEventId,
            cycle,
          ),
        );
  if (!eventDraw.ok) {
    return eventDraw;
  }
  const definition = state.enabledEvents.find(
    (event) => event.id === eventDraw.value.value,
  );
  if (definition === undefined) {
    return failure(
      domainError(
        "INVALID_THEMATIC_STATE",
        "The thematic event deck references unknown content.",
        { eventId: eventDraw.value.value },
      ),
    );
  }

  const event: ThematicEventSnapshot = {
    occurrenceId,
    eventId: definition.id,
    contentVersion: definition.contentVersion,
    title: definition.title,
    instruction: definition.instruction,
    triggeredAtCompletedTurn: completedTurns,
    acknowledged: false,
    // Include metadata if available on the definition
    ...(definition.tone !== undefined ? { tone: definition.tone } : {}),
    ...(definition.impact !== undefined ? { impact: definition.impact } : {}),
    ...(definition.category !== undefined
      ? { category: definition.category }
      : {}),
    ...(definition.scope !== undefined ? { scope: definition.scope } : {}),
    ...(definition.duration !== undefined
      ? { duration: definition.duration }
      : {}),
  };

  // Lifecycle management: prune expired events, add new active event
  const currentActiveEvents: ActiveWorldEvent[] = state.activeEvents;
  const estimatedRound = Math.floor(completedTurns / playerCount) + 1;
  const prunedEvents = pruneActiveEvents(
    currentActiveEvents,
    completedTurns,
    playerCount,
    true,
  );

  // Track the new event if it has a non-immediate duration
  const activeEvent = createActiveWorldEventFromDefinition(
    occurrenceId,
    definition,
    WORLD_EVENTS_CATALOG,
    completedTurns,
    estimatedRound,
  );
  const newActiveEvents: ActiveWorldEventRecord[] =
    activeEvent !== null ? [...prunedEvents, activeEvent] : [...prunedEvents];

  return success({
    event,
    state: {
      ...state,
      triggerBag,
      eventDeck: eventDraw.value.deck,
      deferredTrigger: false,
      lastTriggeredAtCompletedTurn: completedTurns,
      previousEventId: definition.id,
      pendingEvent: event,
      activeEvents: newActiveEvents,
    },
  });
}
