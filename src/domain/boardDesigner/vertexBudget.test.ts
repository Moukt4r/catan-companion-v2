/**
 * Tests for the vertex pip budget.
 *
 * A settlement collects from every hex touching its corner, so the combined
 * pip count at a vertex decides how strong a building spot is. These cover the
 * geometry itself, the validation warning, and the generator's repair pass.
 */
import { describe, expect, it } from "vitest";
import {
  boardVertices,
  coordinateKey,
  createClassicIslandInventory,
  createEmptyBoardInventory,
  createSymmetricFootprint,
  generateBoardLayout,
  neighbors,
} from "./index";
import {
  MAX_VERTEX_PIPS,
  NUMBER_TOKEN_PIPS,
  overloadedVertices,
  validateBoardDesign,
} from "./validation";
import { asBoardDesignId, asIsoTimestamp } from "../ids";
import {
  BOARD_DOCUMENT_VERSION,
  NUMBER_TOKEN_VALUES,
  type BoardDesign,
  type BoardHex,
  type BoardInventory,
  type NumberTokenValue,
} from "./types";

/** Deterministic bounded source, mirroring the other generation tests. */
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
    id: asBoardDesignId("vertex-design"),
    revision: 1,
    name: "Vertex design",
    documentVersion: BOARD_DOCUMENT_VERSION,
    createdAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
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

/** Count how many 6/8 tokens sit next to another 6/8. */
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

describe("boardVertices", () => {
  it("gives a lone hex six distinct corners", () => {
    const vertices = boardVertices([{ q: 0, r: 0 }]);
    expect(vertices).toHaveLength(6);
    // Only the hex itself is on the board, so every corner reports one hex.
    expect(vertices.every((vertex) => vertex.coordinates.length === 1)).toBe(
      true,
    );
    expect(new Set(vertices.map((vertex) => vertex.key)).size).toBe(6);
  });

  it("shares one corner between two neighbouring hexes", () => {
    const vertices = boardVertices([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    const shared = vertices.filter((vertex) => vertex.coordinates.length === 2);
    // Two adjacent hexes meet along one edge, whose two endpoints are shared.
    expect(shared).toHaveLength(2);
  });

  it("finds the corner where three hexes meet", () => {
    const vertices = boardVertices([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ]);
    const triple = vertices.filter((vertex) => vertex.coordinates.length === 3);
    expect(triple).toHaveLength(1);
  });

  it("de-duplicates corners rather than repeating them per hex", () => {
    const coordinates = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ];
    const vertices = boardVertices(coordinates);
    // Naively there would be 3 x 6 = 18 corners; shared ones collapse.
    expect(vertices.length).toBeLessThan(coordinates.length * 6);
    expect(new Set(vertices.map((vertex) => vertex.key)).size).toBe(
      vertices.length,
    );
  });

  it("returns nothing for an empty board", () => {
    expect(boardVertices([])).toEqual([]);
  });
});

describe("overloadedVertices", () => {
  it("accepts a corner that lands exactly on the limit", () => {
    // 8 + 4 + 2 = 5 + 3 + 1 = 9, the largest allowed total.
    const hexes = [hexAt(0, 0, 8), hexAt(1, 0, 4), hexAt(0, 1, 2)];
    expect(
      NUMBER_TOKEN_PIPS[8] + NUMBER_TOKEN_PIPS[4] + NUMBER_TOKEN_PIPS[2],
    ).toBe(MAX_VERTEX_PIPS);
    expect(overloadedVertices(hexes)).toEqual([]);
  });

  it("rejects a corner one pip over the limit", () => {
    // 6 + 10 + 3 = 5 + 3 + 2 = 10.
    const hexes = [hexAt(0, 0, 6), hexAt(1, 0, 10), hexAt(0, 1, 3)];
    const overloaded = overloadedVertices(hexes);
    expect(overloaded).toHaveLength(1);
    expect(overloaded[0]?.pips).toBe(10);
    expect(overloaded[0]?.coordinates).toHaveLength(3);
  });

  it("ignores hexes with no number token", () => {
    const hexes = [hexAt(0, 0, 6), hexAt(1, 0, null), hexAt(0, 1, null)];
    expect(overloadedVertices(hexes)).toEqual([]);
  });

  it("reports the worst corner first", () => {
    const hexes = [
      hexAt(0, 0, 6),
      hexAt(1, 0, 8),
      hexAt(0, 1, 6),
      hexAt(1, -1, 8),
    ];
    const overloaded = overloadedVertices(hexes);
    expect(overloaded.length).toBeGreaterThan(1);
    for (let index = 1; index < overloaded.length; index += 1) {
      expect(overloaded[index - 1]!.pips).toBeGreaterThanOrEqual(
        overloaded[index]!.pips,
      );
    }
  });

  it("finds nothing on an empty board", () => {
    expect(overloadedVertices([])).toEqual([]);
  });
});

describe("validateBoardDesign vertex warning", () => {
  it("stays quiet when every corner is within budget", () => {
    const design = designOf([hexAt(0, 0, 8), hexAt(1, 0, 4), hexAt(0, 1, 2)]);
    const issues = validateBoardDesign(design).filter(
      (issue) => issue.code === "vertex-pip-overload",
    );
    expect(issues).toEqual([]);
  });

  it("warns about a single overloaded corner", () => {
    const design = designOf([hexAt(0, 0, 6), hexAt(1, 0, 10), hexAt(0, 1, 3)]);
    const issue = validateBoardDesign(design).find(
      (candidate) => candidate.code === "vertex-pip-overload",
    );
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("One building spot");
    expect(issue?.message).toContain(String(MAX_VERTEX_PIPS));
  });

  it("summarises several overloaded corners", () => {
    const design = designOf([
      hexAt(0, 0, 6),
      hexAt(1, 0, 8),
      hexAt(0, 1, 6),
      hexAt(1, -1, 8),
    ]);
    const issue = validateBoardDesign(design).find(
      (candidate) => candidate.code === "vertex-pip-overload",
    );
    expect(issue?.message).toMatch(/\d+ building spots exceed/);
  });
});

describe("generation respects the vertex budget", () => {
  it("clears the standard inventory across many seeds", () => {
    let clean = 0;
    let boards = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const layout = generate(createClassicIslandInventory(), seed);
      boards += 1;
      if (overloadedVertices(layout.hexes).length === 0) {
        clean += 1;
      }
    }
    // The budget is tight enough that a rare board cannot be cleared without
    // breaking red-number adjacency, which is never traded away.
    expect(clean).toBeGreaterThanOrEqual(boards - 1);
  });

  it("never separates the vertex budget from red-number adjacency", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const layout = generate(createClassicIslandInventory(), seed);
      expect(adjacentRedPairs(layout.hexes)).toBe(0);
    }
  });

  it("stays reproducible for a given seed", () => {
    const inventory = createClassicIslandInventory();
    expect(generate(inventory, 77)).toEqual(generate(inventory, 77));
  });

  it("handles a large mixed-token board", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 40;
    inventory.terrain.sea = 20;
    for (const [index, value] of NUMBER_TOKEN_VALUES.entries()) {
      inventory.numbers[value] = index < 4 ? 5 : 4;
    }
    const layout = generate(inventory, 3);
    expect(overloadedVertices(layout.hexes)).toEqual([]);
  });

  it("leaves a board with too few tokens alone", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 3;
    inventory.terrain.sea = 4;
    inventory.numbers[5] = 1;
    const layout = generate(inventory, 5);
    // A single token cannot overload anything, and repair must not disturb it.
    expect(overloadedVertices(layout.hexes)).toEqual([]);
    expect(layout.hexes.filter((hex) => hex.numberToken !== null)).toHaveLength(
      1,
    );
  });
});
