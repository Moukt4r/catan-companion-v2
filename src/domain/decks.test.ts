import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createCanonicalNumberedDeck,
  createEventDeck,
  createNumberedDeck,
  drawEventFace,
  drawNumberedOutcome,
  fisherYates,
  uniformBoundedInt,
} from "./index";
import { asRevisionId } from "./ids";

describe("balanced decks", () => {
  it("builds all 36 ordered pairs exactly once", () => {
    const deck = createCanonicalNumberedDeck();
    expect(deck).toHaveLength(36);
    expect(
      new Set(deck.map(({ red, yellow }) => `${red}-${yellow}`)).size,
    ).toBe(36);
  });

  it("preserves exact numbered composition and uniqueness for arbitrary shuffles", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 40, maxLength: 80 }),
        (draws) => {
          let cursor = 0;
          const deck = createNumberedDeck((upperExclusive) => {
            const value = draws[cursor % draws.length] ?? 0;
            cursor += 1;
            return value % upperExclusive;
          }, asRevisionId("revision-1"));
          const keys = deck.order.map(({ red, yellow }) => `${red}-${yellow}`);
          expect(keys).toHaveLength(36);
          expect(new Set(keys).size).toBe(36);
          expect([...keys].sort()).toEqual(
            createCanonicalNumberedDeck()
              .map(({ red, yellow }) => `${red}-${yellow}`)
              .sort(),
          );
        },
      ),
    );
  });

  it("preserves the event deck 3/1/1/1 distribution", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(), { minLength: 8, maxLength: 30 }),
        (draws) => {
          let cursor = 0;
          const deck = createEventDeck((upperExclusive) => {
            const value = draws[cursor % draws.length] ?? 0;
            cursor += 1;
            return value % upperExclusive;
          }, asRevisionId("revision-1"));
          expect(
            deck.order.filter((face) => face === "barbarian"),
          ).toHaveLength(3);
          expect(deck.order.filter((face) => face === "science")).toHaveLength(
            1,
          );
          expect(deck.order.filter((face) => face === "trade")).toHaveLength(1);
          expect(deck.order.filter((face) => face === "politics")).toHaveLength(
            1,
          );
        },
      ),
    );
  });

  it("advances cursors and starts a new cycle only after exhaustion", () => {
    const revision = asRevisionId("revision-1");
    let numbered = createNumberedDeck(() => 0, revision);
    const first = drawNumberedOutcome(numbered, () => 0, revision);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.index).toBe(0);
    numbered = { ...first.value.deck, cursor: 36 };
    const nextCycle = drawNumberedOutcome(numbered, () => 0, revision);
    expect(nextCycle.ok).toBe(true);
    if (!nextCycle.ok) return;
    expect(nextCycle.value.cycle).toBe(2);
    expect(nextCycle.value.index).toBe(0);
    expect(nextCycle.value.deck.cursor).toBe(1);

    let event = createEventDeck(() => 0, revision);
    event = { ...event, cursor: 6 };
    const nextEventCycle = drawEventFace(event, () => 0, revision);
    expect(nextEventCycle.ok).toBe(true);
    if (!nextEventCycle.ok) return;
    expect(nextEventCycle.value.cycle).toBe(2);
    expect(nextEventCycle.value.deck.cursor).toBe(1);
  });

  it("supports every injected bounded choice in generic Fisher-Yates", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 3 }),
          fc.integer({ min: 0, max: 2 }),
          fc.integer({ min: 0, max: 1 }),
        ),
        (choices) => {
          let cursor = 0;
          const shuffled = fisherYates([1, 2, 3, 4], (upperExclusive) => {
            const choice = choices[cursor] ?? 0;
            cursor += 1;
            return choice % upperExclusive;
          });
          expect([...shuffled].sort()).toEqual([1, 2, 3, 4]);
        },
      ),
    );
  });

  it("rejects the biased uint32 tail before applying a bounded modulo", () => {
    const values = [0xffff_ffff, 0];
    let cursor = 0;
    const result = uniformBoundedInt(
      {
        nextUint32() {
          const value = values[cursor] ?? 0;
          cursor += 1;
          return value;
        },
      },
      3,
    );
    expect(result).toEqual({ ok: true, value: 0 });
    expect(cursor).toBe(2);
  });
});

describe("early numbered-deck reshuffle", () => {
  const revision = asRevisionId("reshuffle-revision");
  const random = () => 0;

  function freshDeck() {
    return createNumberedDeck(random, revision);
  }

  it("draws all 36 cards when the threshold is zero", () => {
    let deck = freshDeck();
    for (let index = 0; index < 36; index += 1) {
      const draw = drawNumberedOutcome(deck, random, revision, 0);
      expect(draw.ok).toBe(true);
      if (!draw.ok) return;
      expect(draw.value.startedNewCycle).toBe(false);
      expect(draw.value.skipped).toEqual([]);
      deck = draw.value.deck;
    }
    expect(deck.cursor).toBe(36);
  });

  it("starts a new year at card 32 and reports the four undrawn cards", () => {
    let deck = freshDeck();
    const expectedSkipped = deck.order.slice(32);

    for (let index = 0; index < 32; index += 1) {
      const draw = drawNumberedOutcome(deck, random, revision, 4);
      expect(draw.ok).toBe(true);
      if (!draw.ok) return;
      expect(draw.value.startedNewCycle).toBe(false);
      deck = draw.value.deck;
    }

    const boundary = drawNumberedOutcome(deck, random, revision, 4);
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) return;
    expect(boundary.value.startedNewCycle).toBe(true);
    expect(boundary.value.cycle).toBe(2);
    expect(boundary.value.skipped).toHaveLength(4);
    expect(boundary.value.skipped).toEqual(expectedSkipped);
    expect(boundary.value.deck.cursor).toBe(1);
    expect(boundary.value.deck.order).toHaveLength(36);
  });

  it("reshuffles without skips when an exhausted deck rolls over", () => {
    let deck = freshDeck();
    for (let index = 0; index < 36; index += 1) {
      const draw = drawNumberedOutcome(deck, random, revision, 0);
      if (!draw.ok) return;
      deck = draw.value.deck;
    }
    const rollover = drawNumberedOutcome(deck, random, revision, 0);
    expect(rollover.ok).toBe(true);
    if (!rollover.ok) return;
    expect(rollover.value.startedNewCycle).toBe(true);
    expect(rollover.value.skipped).toEqual([]);
    expect(rollover.value.cycle).toBe(2);
  });

  it("never cuts a brand-new deck short even for large thresholds", () => {
    const deck = freshDeck();
    const draw = drawNumberedOutcome(deck, random, revision, 12);
    expect(draw.ok).toBe(true);
    if (!draw.ok) return;
    expect(draw.value.startedNewCycle).toBe(false);
    expect(draw.value.deck.cursor).toBe(1);
  });

  it("clamps out-of-range thresholds instead of failing", () => {
    let deck = freshDeck();
    for (let index = 0; index < 24; index += 1) {
      const draw = drawNumberedOutcome(deck, random, revision, Number.NaN);
      if (!draw.ok) return;
      deck = draw.value.deck;
    }
    // NaN clamps to 0, so no early reshuffle should have happened.
    expect(deck.cursor).toBe(24);

    const huge = drawNumberedOutcome(deck, random, revision, 999);
    expect(huge.ok).toBe(true);
    if (!huge.ok) return;
    // 999 clamps to 12; 12 cards remain, so this is exactly the boundary.
    expect(huge.value.startedNewCycle).toBe(true);
    expect(huge.value.skipped).toHaveLength(12);
  });

  it("rejects a corrupt deck", () => {
    const deck = freshDeck();
    const corrupt = drawNumberedOutcome(
      { ...deck, cursor: -1 },
      random,
      revision,
      4,
    );
    expect(corrupt.ok).toBe(false);
    if (corrupt.ok) return;
    expect(corrupt.error.code).toBe("DECK_STATE_CORRUPT");

    const empty = drawNumberedOutcome(
      { ...deck, order: [], cursor: 0 },
      random,
      revision,
      4,
    );
    expect(empty.ok).toBe(false);
  });
});

describe("numbered draw defensive guards", () => {
  const revision = asRevisionId("guard-revision");
  const random = () => 0;

  it("fails when the deck has a hole at its cursor", () => {
    const deck = createNumberedDeck(random, revision);
    const holed = {
      ...deck,
      order: deck.order.map((card, index) =>
        index === 0 ? (undefined as never) : card,
      ),
    };
    const result = drawNumberedOutcome(holed, random, revision, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECK_STATE_CORRUPT");
  });

  it("rolls a fully drawn deck over into a fresh cycle", () => {
    const deck = createNumberedDeck(random, revision);
    const exhausted = { ...deck, cursor: deck.order.length };
    const result = drawNumberedOutcome(exhausted, random, revision, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.startedNewCycle).toBe(true);
    expect(result.value.skipped).toEqual([]);
    expect(result.value.deck.order).toHaveLength(36);
  });
});
