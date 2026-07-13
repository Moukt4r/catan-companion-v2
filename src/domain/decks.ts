import { domainError, failure, success } from "./errors";
import { EVENT_DECK_FACES } from "./rules";
import { fisherYates } from "./random";
import type {
  BoundedIntSource,
  DeckState,
  DieValue,
  DomainResult,
  EventDeckState,
  EventFace,
  NumberedDeckState,
  NumberedOutcome,
  RandomSource,
  RevisionId,
} from "./types";

const DIE_VALUES: readonly DieValue[] = [1, 2, 3, 4, 5, 6];

export function createCanonicalNumberedDeck(): NumberedOutcome[] {
  return DIE_VALUES.flatMap((red) =>
    DIE_VALUES.map((yellow) => ({ red, yellow })),
  );
}

export function createNumberedDeck(
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  cycle = 1,
): NumberedDeckState {
  return {
    cycle,
    cursor: 0,
    order: fisherYates(createCanonicalNumberedDeck(), random),
    createdAtRevision: revisionId,
  };
}

export function createEventDeck(
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
  cycle = 1,
): EventDeckState {
  return {
    cycle,
    cursor: 0,
    order: fisherYates(EVENT_DECK_FACES, random),
    createdAtRevision: revisionId,
  };
}

export interface DeckDraw<T> {
  value: T;
  deck: DeckState<T>;
  cycle: number;
  index: number;
}

export function drawDeck<T>(
  deck: DeckState<T>,
  createNextCycle: (cycle: number) => DeckState<T>,
): DomainResult<DeckDraw<T>> {
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

  const activeDeck =
    deck.cursor === deck.order.length ? createNextCycle(deck.cycle + 1) : deck;
  const value = activeDeck.order[activeDeck.cursor];
  if (value === undefined) {
    return failure(
      domainError("DECK_STATE_CORRUPT", "Deck has no value at its cursor.", {
        cycle: activeDeck.cycle,
        cursor: activeDeck.cursor,
      }),
    );
  }

  return success({
    value,
    cycle: activeDeck.cycle,
    index: activeDeck.cursor,
    deck: { ...activeDeck, cursor: activeDeck.cursor + 1 },
  });
}

export function drawNumberedOutcome(
  deck: NumberedDeckState,
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
): DomainResult<DeckDraw<NumberedOutcome>> {
  return drawDeck(deck, (cycle) =>
    createNumberedDeck(random, revisionId, cycle),
  );
}

export function drawEventFace(
  deck: EventDeckState,
  random: RandomSource | BoundedIntSource,
  revisionId: RevisionId,
): DomainResult<DeckDraw<EventFace>> {
  return drawDeck(deck, (cycle) => createEventDeck(random, revisionId, cycle));
}
