/**
 * Tests for the strong-but-legal number-token rules.
 *
 * A corner can stay inside the pip budget and still be a premium opening: two
 * four-pip tokens sum to eight, under the cap, and the same number twice pays
 * out together on every matching roll. These cover the detection helpers, the
 * validation warnings, and the generator's polish pass.
 */
import { describe, expect, it } from "vitest";
import {
  coordinateKey,
  createClassicIslandInventory,
  createEmptyBoardInventory,
  createSymmetricFootprint,
  generateBoardLayout,
  neighbors,
} from "./index";
import {
  overloadedVertices,
  pairedHighNumberVertices,
  repeatedNumberVertices,
  validateBoardDesign,
} from "./validation";
import { asBoardDesignId, asIsoTimestamp } from "../ids";
import {
  BOARD_DOCUMENT_VERSION,
  type BoardDesign,
  type BoardHex,
  type BoardInventory,
  type NumberTokenValue,
} from "./types";

function randomSequence(seed: number): (upperExclusive: number) => number {
  let state = seed >>> 0;
  return (upperExclusive) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % upperExclusive;
  };
}

function generate(inventory: BoardInventory, seed: number) {
  const count = Object.values(inventory.terrain).reduce(
    (total, value) => total + value,
    0,
  );
  const footprint = createSymmetricFootprint(count);
  if (!footprint.ok) {
    throw new Error("Footprint could not be created.");
  }
  const result = generateBoardLayout(
    inventory,
    randomSequence(seed),
    footprint.value,
  );
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function designOf(hexes: BoardHex[]): BoardDesign {
  return {
    id: asBoardDesignId("number-rules-design"),
    revision: 1,
    name: "Number rules design",
    documentVersion: BOARD_DOCUMENT_VERSION,
    createdAt: asIsoTimestamp("2026-07-26T10:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-26T10:00:00.000Z"),
    inventory: createEmptyBoardInventory(),
    footprint: hexes.map((hex) => ({ ...hex.coordinate })),
    hexes,
    ports: [],
  };
}

function hexAt(
  q: number,
  r: number,
  numberToken: NumberTokenValue | null,
): BoardHex {
  return { coordinate: { q, r }, terrain: "forest", numberToken };
}

function adjacentRedPairs(hexes: readonly BoardHex[]): number {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  let pairs = 0;
  for (const hex of hexes) {
    if (hex.numberToken !== 6 && hex.numberToken !== 8) {
      continue;
    }
    for (const coordinate of neighbors(hex.coordinate)) {
      const other = byKey.get(coordinateKey(coordinate));
      if (
        (other?.numberToken === 6 || other?.numberToken === 8) &&
        coordinateKey(hex.coordinate) < coordinateKey(other.coordinate)
      ) {
        pairs += 1;
      }
    }
  }
  return pairs;
}

describe("pairedHighNumberVertices", () => {
  it("flags two four-pip tokens sharing a corner", () => {
    // 5 and 9 both carry four pips and sum to eight, inside the pip cap.
    const hexes = [hexAt(0, 0, 5), hexAt(1, 0, 9), hexAt(0, 1, null)];
    expect(pairedHighNumberVertices(hexes)).not.toHaveLength(0);
    expect(overloadedVertices(hexes)).toEqual([]);
  });

  it("ignores a four-pip token beside a low one", () => {
    const hexes = [hexAt(0, 0, 5), hexAt(1, 0, 2), hexAt(0, 1, null)];
    expect(pairedHighNumberVertices(hexes)).toEqual([]);
  });

  it("does not treat red tokens as a four-pip pair", () => {
    // 6 and 8 carry five pips each; they are covered by the red-adjacency rule.
    const hexes = [hexAt(0, 0, 6), hexAt(1, 0, 8), hexAt(0, 1, null)];
    expect(pairedHighNumberVertices(hexes)).toEqual([]);
  });
});

describe("repeatedNumberVertices", () => {
  it("flags the same number twice on one corner", () => {
    const hexes = [hexAt(0, 0, 10), hexAt(1, 0, 10), hexAt(0, 1, null)];
    expect(repeatedNumberVertices(hexes)).not.toHaveLength(0);
  });

  it("accepts distinct numbers", () => {
    const hexes = [hexAt(0, 0, 10), hexAt(1, 0, 4), hexAt(0, 1, null)];
    expect(repeatedNumberVertices(hexes)).toEqual([]);
  });

  it("ignores hexes without a token", () => {
    const hexes = [hexAt(0, 0, null), hexAt(1, 0, null), hexAt(0, 1, null)];
    expect(repeatedNumberVertices(hexes)).toEqual([]);
  });
});

describe("validateBoardDesign number warnings", () => {
  it("warns about a paired four-pip corner", () => {
    const issues = validateBoardDesign(
      designOf([hexAt(0, 0, 5), hexAt(1, 0, 9), hexAt(0, 1, null)]),
    );
    expect(issues.map((issue) => issue.code)).toContain("paired-high-numbers");
  });

  it("warns about a repeated number on a corner", () => {
    const issues = validateBoardDesign(
      designOf([hexAt(0, 0, 10), hexAt(1, 0, 10), hexAt(0, 1, null)]),
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "repeated-number-vertex",
    );
  });

  it("stays quiet on a clean corner", () => {
    const issues = validateBoardDesign(
      designOf([hexAt(0, 0, 4), hexAt(1, 0, 3), hexAt(0, 1, null)]),
    );
    const codes = issues.map((issue) => issue.code);
    expect(codes).not.toContain("paired-high-numbers");
    expect(codes).not.toContain("repeated-number-vertex");
  });
});

describe("generation avoids strong-but-legal corners", () => {
  it("leaves repeated numbers rare across many seeds", () => {
    let affected = 0;
    const boards = 20;
    for (let seed = 1; seed <= boards; seed += 1) {
      const layout = generate(createClassicIslandInventory(), seed);
      if (repeatedNumberVertices(layout.hexes).length > 0) {
        affected += 1;
      }
    }
    // Measured at roughly 7% of boards; the old generator left 96% affected.
    expect(affected).toBeLessThanOrEqual(boards * 0.25);
  });

  it("keeps paired four-pip corners well below the old rate", () => {
    let total = 0;
    const boards = 20;
    for (let seed = 1; seed <= boards; seed += 1) {
      const layout = generate(createClassicIslandInventory(), seed);
      total += pairedHighNumberVertices(layout.hexes).length;
    }
    // The old generator averaged about three such corners per board. Some
    // pairing is forced: twelve tokens carry four or more pips while the
    // largest set of mutually non-adjacent land hexes holds about ten.
    expect(total / boards).toBeLessThan(2);
  });

  it("never trades away a harder rule to clear a softer one", () => {
    // The softer rules must never cost an adjacent red pair or push a corner
    // over the pip budget. An earlier attempt folded all four terms into one
    // score and did exactly that.
    let overloaded = 0;
    const boards = 20;
    for (let seed = 1; seed <= boards; seed += 1) {
      const layout = generate(createClassicIslandInventory(), seed);
      expect(adjacentRedPairs(layout.hexes)).toBe(0);
      overloaded += overloadedVertices(layout.hexes).length;
    }
    expect(overloaded).toBeLessThanOrEqual(boards * 0.1);
  });

  it("stays reproducible for a given seed", () => {
    const inventory = createClassicIslandInventory();
    expect(generate(inventory, 41)).toEqual(generate(inventory, 41));
  });
});
