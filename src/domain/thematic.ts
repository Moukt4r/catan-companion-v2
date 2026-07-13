import { domainError, failure, success } from "./errors";
import { drawDeck } from "./decks";
import { fisherYates } from "./random";
import { THEMATIC_TRIGGER_BAG_SIZE } from "./rules";
import type {
  BoundedIntSource,
  DeckState,
  DomainResult,
  EventId,
  EventOccurrenceId,
  RandomSource,
  RevisionId,
  ThematicCadence,
  ThematicEventDefinition,
  ThematicEventSnapshot,
  ThematicEventState,
  TriggerToken,
} from "./types";

export function createTriggerBag(
  cadence: ThematicCadence,
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  cycle = 1,
): DeckState<TriggerToken> {
  const size = THEMATIC_TRIGGER_BAG_SIZE[cadence];
  return {
    cycle,
    cursor: 0,
    order: fisherYates(
      Array.from({ length: size }, (_, index) => ({ trigger: index === 0 })),
      random,
    ),
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
  const order = fisherYates(
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
  return {
    cycle,
    cursor: 0,
    order,
    createdAtRevision: revisionId,
  };
}

export function createThematicState(
  enabled: boolean,
  cadence: ThematicCadence,
  events: readonly ThematicEventDefinition[],
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
): ThematicEventState {
  return {
    enabled,
    cadence,
    enabledEvents: events.map((event) => ({ ...event })),
    triggerBag: createTriggerBag(cadence, random, revisionId),
    eventDeck: createThematicEventDeck(events, random, revisionId, null),
    deferredTrigger: false,
    lastTriggeredAtCompletedTurn: null,
    previousEventId: null,
    pendingEvent: null,
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

  const eligible =
    completedTurns >= playerCount &&
    (state.lastTriggeredAtCompletedTurn === null ||
      completedTurns - state.lastTriggeredAtCompletedTurn >= 2);

  let triggerBag = state.triggerBag;
  let shouldTrigger = state.deferredTrigger;

  if (!state.deferredTrigger) {
    const triggerDraw = drawDeck(triggerBag, (cycle) =>
      createTriggerBag(state.cadence, random, revisionId, cycle),
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

  const eventDraw = drawDeck(state.eventDeck, (cycle) =>
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
  };
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
    },
  });
}
