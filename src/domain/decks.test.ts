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
