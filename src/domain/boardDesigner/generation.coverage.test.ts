import { describe, expect, it } from "vitest";
import {
  connectedHexGroups,
  coordinateKey,
  createEmptyBoardInventory,
  createSymmetricFootprint,
  edgeKey,
  generateBoardLayout,
  isConnected,
  isSymmetricFootprint,
  isValidPortPlacement,
  MAX_BOARD_HEXES,
  neighbors,
  NUMBER_TOKEN_VALUES,
  type BoardHex,
  type BoardInventory,
  type GeneratedBoardLayout,
  type HexCoordinate,
  type NumberTokenValue,
  type PortType,
  type TerrainType,
} from "../index";

/**
 * Same linear-congruential source the main board designer suite uses. It keeps
 * every scenario below deterministic, so an assertion that fails here is a real
 * behaviour change rather than an unlucky draw.
 */
function randomSequence(seed: number): (upperExclusive: number) => number {
  let state = seed >>> 0;
  return (upperExclusive) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % upperExclusive;
  };
}

interface InventorySpec {
  terrain?: Partial<Record<TerrainType, number>>;
  numbers?: Partial<Record<NumberTokenValue, number>>;
  ports?: Partial<Record<PortType, number>>;
}

function inventoryOf(spec: InventorySpec): BoardInventory {
  const inventory = createEmptyBoardInventory();
  for (const [terrain, count] of Object.entries(spec.terrain ?? {})) {
    inventory.terrain[terrain as TerrainType] = count;
  }
  for (const [value, count] of Object.entries(spec.numbers ?? {})) {
    inventory.numbers[Number(value) as NumberTokenValue] = count;
  }
  for (const [port, count] of Object.entries(spec.ports ?? {})) {
    inventory.ports[port as PortType] = count;
  }
  return inventory;
}

function hexCountOf(inventory: BoardInventory): number {
  return Object.values(inventory.terrain).reduce(
    (total, count) => total + count,
    0,
  );
}

function defaultFootprint(inventory: BoardInventory): HexCoordinate[] {
  const footprint = createSymmetricFootprint(hexCountOf(inventory));
  if (!footprint.ok) {
    throw new Error(`No symmetric footprint for ${hexCountOf(inventory)}`);
  }
  return footprint.value;
}

function generate(
  inventory: BoardInventory,
  seed: number,
  footprint: readonly HexCoordinate[] = defaultFootprint(inventory),
) {
  return generateBoardLayout(inventory, randomSequence(seed), footprint);
}

function expectLayout(
  result: ReturnType<typeof generateBoardLayout>,
): GeneratedBoardLayout {
  if (!result.ok) {
    throw new Error(
      `Expected a generated layout, got: ${result.error.message}`,
    );
  }
  return result.value;
}

function expectFailure(result: ReturnType<typeof generateBoardLayout>): string {
  if (result.ok) {
    throw new Error("Expected generation to fail, but it succeeded.");
  }
  expect(result.error.code).toBe("invalid-layout");
  return result.error.message;
}

function terrainCounts(
  hexes: readonly BoardHex[],
): Record<TerrainType, number> {
  const counts = createEmptyBoardInventory().terrain;
  for (const hex of hexes) {
    counts[hex.terrain] += 1;
  }
  return counts;
}

function landGroupSizes(hexes: readonly BoardHex[]): number[] {
  return connectedHexGroups(hexes, (hex) => hex.terrain !== "sea")
    .map((group) => group.length)
    .sort((left, right) => left - right);
}

function adjacentRedPairs(hexes: readonly BoardHex[]): number {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const isRed = (hex: BoardHex | undefined): boolean =>
    hex?.numberToken === 6 || hex?.numberToken === 8;
  const pairs = new Set<string>();
  for (const hex of hexes) {
    if (!isRed(hex)) {
      continue;
    }
    const key = coordinateKey(hex.coordinate);
    for (const coordinate of neighbors(hex.coordinate)) {
      const otherKey = coordinateKey(coordinate);
      if (!isRed(byKey.get(otherKey))) {
        continue;
      }
      pairs.add(key < otherKey ? `${key}|${otherKey}` : `${otherKey}|${key}`);
    }
  }
  return pairs.size;
}

/** Number of land/sea hex borders — the upper bound on placeable ports. */
function coastEdgeCount(hexes: readonly BoardHex[]): number {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex.terrain]),
  );
  let count = 0;
  for (const hex of hexes) {
    if (hex.terrain === "sea") {
      continue;
    }
    for (const coordinate of neighbors(hex.coordinate)) {
      if (byKey.get(coordinateKey(coordinate)) === "sea") {
        count += 1;
      }
    }
  }
  return count;
}

function assertHealthyLayout(
  layout: GeneratedBoardLayout,
  inventory: BoardInventory,
): void {
  expect(layout.hexes).toHaveLength(hexCountOf(inventory));
  expect(terrainCounts(layout.hexes)).toEqual(inventory.terrain);
  expect(
    new Set(layout.hexes.map((hex) => coordinateKey(hex.coordinate))).size,
  ).toBe(layout.hexes.length);
  expect(isConnected(layout.hexes)).toBe(true);
  for (const size of landGroupSizes(layout.hexes)) {
    expect(size).toBeGreaterThanOrEqual(3);
  }
  expect(
    new Set(
      layout.ports.map((port) => edgeKey(port.landCoordinate, port.direction)),
    ).size,
  ).toBe(layout.ports.length);
  for (const port of layout.ports) {
    expect(isValidPortPlacement(port, layout.hexes)).toBe(true);
  }
}

const INVALID_FOOTPRINT_MESSAGE =
  "Create a connected 180-degree symmetric border that matches the tile count before generating.";
const PORT_FAILURE_MESSAGE =
  "The selected border could not fit every requested port.";

describe("board generation input guards", () => {
  it("refuses to generate from an entirely empty inventory", () => {
    expect(
      generateBoardLayout(createEmptyBoardInventory(), randomSequence(1), []),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-layout",
        message: "Add at least one terrain or sea hex first.",
      },
    });
  });

  it("refuses inventories larger than the supported board size", () => {
    const inventory = inventoryOf({
      terrain: { forest: MAX_BOARD_HEXES, sea: 1 },
    });

    expect(generateBoardLayout(inventory, randomSequence(1), [])).toEqual({
      ok: false,
      error: {
        code: "invalid-layout",
        message: `A design can contain at most ${MAX_BOARD_HEXES} hexes.`,
      },
    });
  });

  it("checks the hex-count ceiling before the land-count rule", () => {
    // One land hex would normally trip "at least three land hexes"; the size
    // guard has to win so the user sees the actionable message first.
    const inventory = inventoryOf({
      terrain: { forest: 1, sea: MAX_BOARD_HEXES },
    });

    expect(expectFailure(generateBoardLayout(inventory, () => 0, []))).toBe(
      `A design can contain at most ${MAX_BOARD_HEXES} hexes.`,
    );
  });

  it("rejects a footprint whose size does not match the inventory", () => {
    const inventory = inventoryOf({ terrain: { sea: 3 } });
    const footprint = createSymmetricFootprint(5);
    expect(footprint.ok).toBe(true);
    if (!footprint.ok) {
      return;
    }

    expect(expectFailure(generate(inventory, 1, footprint.value))).toBe(
      INVALID_FOOTPRINT_MESSAGE,
    );
  });

  it("rejects a footprint that repeats a coordinate", () => {
    const inventory = inventoryOf({ terrain: { sea: 3 } });
    const duplicated: HexCoordinate[] = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: 0 },
    ];

    expect(duplicated).toHaveLength(hexCountOf(inventory));
    expect(expectFailure(generate(inventory, 1, duplicated))).toBe(
      INVALID_FOOTPRINT_MESSAGE,
    );
  });

  it("rejects a connected but asymmetric footprint", () => {
    const inventory = inventoryOf({ terrain: { sea: 4 } });
    const asymmetric: HexCoordinate[] = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 2, r: 1 },
    ];

    expect(asymmetric).toHaveLength(hexCountOf(inventory));
    expect(new Set(asymmetric.map(coordinateKey)).size).toBe(asymmetric.length);
    expect(isSymmetricFootprint(asymmetric)).toBe(false);
    expect(expectFailure(generate(inventory, 1, asymmetric))).toBe(
      INVALID_FOOTPRINT_MESSAGE,
    );
  });

  it("rejects a symmetric but disconnected footprint", () => {
    const inventory = inventoryOf({ terrain: { sea: 2 } });
    const disconnected: HexCoordinate[] = [
      { q: -2, r: 0 },
      { q: 2, r: 0 },
    ];

    expect(isSymmetricFootprint(disconnected)).toBe(true);
    expect(
      isConnected(
        disconnected.map((coordinate) => ({
          coordinate,
          terrain: "sea" as const,
          numberToken: null,
        })),
      ),
    ).toBe(false);
    expect(expectFailure(generate(inventory, 1, disconnected))).toBe(
      INVALID_FOOTPRINT_MESSAGE,
    );
  });

  it("accepts a caller-supplied footprint that is not the default shape", () => {
    const inventory = inventoryOf({ terrain: { forest: 5, sea: 1 } });
    const line: HexCoordinate[] = [-3, -2, -1, 0, 1, 2].map((q) => ({
      q,
      r: 0,
    }));

    const layout = expectLayout(generate(inventory, 4, line));

    expect(
      layout.hexes.map((hex) => coordinateKey(hex.coordinate)).sort(),
    ).toEqual(line.map(coordinateKey).sort());
    assertHealthyLayout(layout, inventory);
  });
});

describe("board generation with degenerate inventories", () => {
  it("produces a sea-only board with no ports and no number tokens", () => {
    const inventory = inventoryOf({ terrain: { sea: 7 } });

    const layout = expectLayout(generate(inventory, 9));

    expect(layout.hexes.every((hex) => hex.terrain === "sea")).toBe(true);
    expect(layout.hexes.every((hex) => hex.numberToken === null)).toBe(true);
    expect(layout.ports).toEqual([]);
    expect(landGroupSizes(layout.hexes)).toEqual([]);
  });

  it("cannot satisfy ports on a sea-only board", () => {
    const inventory = inventoryOf({
      terrain: { sea: 7 },
      ports: { generic: 2 },
    });

    expect(expectFailure(generate(inventory, 9))).toBe(PORT_FAILURE_MESSAGE);
  });

  it("cannot satisfy ports on a board with no sea at all", () => {
    const inventory = inventoryOf({
      terrain: { forest: 3 },
      ports: { generic: 1 },
    });

    expect(expectFailure(generate(inventory, 9))).toBe(PORT_FAILURE_MESSAGE);
  });

  it("leaves non-producing terrain unnumbered and drops surplus tokens", () => {
    const inventory = inventoryOf({
      terrain: { desert: 5, sea: 2 },
      numbers: { 5: 3 },
    });

    const layout = expectLayout(generate(inventory, 4));

    expect(layout.hexes.every((hex) => hex.numberToken === null)).toBe(true);
    assertHealthyLayout(layout, inventory);
  });

  it("numbers only as many producing hexes as there are tokens", () => {
    const inventory = inventoryOf({
      terrain: { forest: 6, desert: 3, sea: 4 },
      numbers: { 4: 2, 9: 2 },
    });

    const layout = expectLayout(generate(inventory, 6));

    expect(layout.hexes.filter((hex) => hex.numberToken !== null)).toHaveLength(
      4,
    );
    expect(
      layout.hexes.every(
        (hex) => hex.numberToken === null || hex.terrain === "forest",
      ),
    ).toBe(true);
    assertHealthyLayout(layout, inventory);
  });

  it("still lays out a board when the random source always returns zero", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, fields: 4, sea: 6 },
      numbers: { 5: 6, 6: 2, 8: 2 },
      ports: { generic: 3 },
    });

    const layout = expectLayout(
      generateBoardLayout(inventory, () => 0, defaultFootprint(inventory)),
    );

    assertHealthyLayout(layout, inventory);
    expect(layout.ports).toHaveLength(3);
  });

  it("accepts a RandomSource object as well as a bounded-int function", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, sea: 5 },
      numbers: { 3: 4, 10: 4 },
    });
    const footprint = defaultFootprint(inventory);
    let state = 12_345 >>> 0;
    const nextUint32 = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };

    const layout = expectLayout(
      generateBoardLayout(inventory, { nextUint32 }, footprint),
    );

    assertHealthyLayout(layout, inventory);
  });

  it("propagates a random source that violates its bound contract", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, sea: 5 },
    });

    expect(() =>
      generateBoardLayout(
        inventory,
        (upperExclusive) => upperExclusive,
        defaultFootprint(inventory),
      ),
    ).toThrow(/Bounded random source returned/);
  });
});

describe("board generation determinism", () => {
  it("returns identical layouts for identical seeds", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, fields: 4, hills: 3, sea: 6 },
      numbers: { 5: 8, 6: 3, 8: 3 },
      ports: { generic: 2, forest: 1 },
    });
    const footprint = defaultFootprint(inventory);

    const first = expectLayout(generate(inventory, 77, footprint));
    const second = expectLayout(generate(inventory, 77, footprint));

    expect(second).toEqual(first);
  });

  it("returns fresh copies rather than aliasing the caller's footprint", () => {
    const inventory = inventoryOf({ terrain: { forest: 3, sea: 4 } });
    const footprint = defaultFootprint(inventory);

    const layout = expectLayout(generate(inventory, 8, footprint));
    for (const hex of layout.hexes) {
      hex.coordinate.q += 100;
    }

    expect(footprint.every((coordinate) => coordinate.q < 100)).toBe(true);
  });
});

describe("terrain layout scoring and island repair", () => {
  it("splits land into multiple islands once the board holds enough sea", () => {
    const inventory = inventoryOf({
      terrain: { forest: 6, pasture: 6, fields: 6, sea: 9 },
      numbers: { 5: 18 },
    });

    const layout = expectLayout(generate(inventory, 21));

    const sizes = landGroupSizes(layout.hexes);
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes[0]).toBeGreaterThanOrEqual(3);
    assertHealthyLayout(layout, inventory);
  });

  it("keeps a single island when there is barely any sea", () => {
    const inventory = inventoryOf({
      terrain: { forest: 5, pasture: 5, fields: 5, sea: 1 },
      numbers: { 5: 15 },
    });

    const layout = expectLayout(generate(inventory, 33));

    expect(landGroupSizes(layout.hexes)).toEqual([15]);
    assertHealthyLayout(layout, inventory);
  });

  it("never emits an island smaller than three hexes across many seeds", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, fields: 4, hills: 4, sea: 9 },
      numbers: { 5: 16 },
    });
    const footprint = defaultFootprint(inventory);

    for (let seed = 0; seed < 12; seed += 1) {
      const layout = expectLayout(generate(inventory, seed, footprint));
      expect(Math.min(...landGroupSizes(layout.hexes))).toBeGreaterThanOrEqual(
        3,
      );
      expect(terrainCounts(layout.hexes)).toEqual(inventory.terrain);
    }
  });

  it("reports failure when island repair cannot rescue a stranded tile", () => {
    // A 1-wide strip gives island repair almost nothing to work with: a land
    // hex isolated at one end has no reachable sea neighbour next to the main
    // island, so repair bails out and generation reports the problem instead
    // of emitting a board with a one-hex island.
    const strip: HexCoordinate[] = Array.from({ length: 14 }, (_, index) => ({
      q: index - 7,
      r: 0,
    }));
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, sea: 6 },
    });

    expect(isSymmetricFootprint(strip)).toBe(true);
    expect(expectFailure(generate(inventory, 6, strip))).toBe(
      "The selected inventory could not form islands of at least three land hexes.",
    );
  });

  it("still succeeds on the same strip for seeds with a workable shuffle", () => {
    // The neighbouring seeds must keep working: the failure above is a genuine
    // dead end for that layout, not a blanket rejection of 1-wide borders.
    const strip: HexCoordinate[] = Array.from({ length: 14 }, (_, index) => ({
      q: index - 7,
      r: 0,
    }));
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, sea: 6 },
    });

    for (const seed of [1, 2, 3, 4, 5, 7]) {
      const layout = expectLayout(generate(inventory, seed, strip));
      expect(Math.min(...landGroupSizes(layout.hexes))).toBeGreaterThanOrEqual(
        3,
      );
      expect(terrainCounts(layout.hexes)).toEqual(inventory.terrain);
    }
  });

  it("collapses the terrain search to one attempt for a single terrain type", () => {
    const inventory = inventoryOf({
      terrain: { forest: 40 },
      numbers: { 5: 40 },
    });
    let draws = 0;
    const source = randomSequence(3);

    const layout = expectLayout(
      generateBoardLayout(
        inventory,
        (upperExclusive) => {
          draws += 1;
          return source(upperExclusive);
        },
        defaultFootprint(inventory),
      ),
    );

    expect(layout.hexes.every((hex) => hex.terrain === "forest")).toBe(true);
    expect(layout.hexes.every((hex) => hex.numberToken === 5)).toBe(true);
    // One terrain type and one token value collapse both optimisation loops to
    // a single shuffle each, so the draw count stays tiny and bounded.
    expect(draws).toBeLessThan(500);
  });
});

describe("number token optimisation", () => {
  it("separates red tokens when a conflict-free arrangement exists", () => {
    const inventory = inventoryOf({
      terrain: { forest: 5, pasture: 5, fields: 5, hills: 3, sea: 6 },
      numbers: { 5: 12, 6: 3, 8: 3 },
    });
    const footprint = defaultFootprint(inventory);

    for (let seed = 0; seed < 6; seed += 1) {
      const layout = expectLayout(generate(inventory, seed, footprint));
      expect(adjacentRedPairs(layout.hexes)).toBe(0);
    }
  });

  it("keeps every requested token on the board when reds cannot be separated", () => {
    // Three land hexes in a row cannot hold three red tokens without touching,
    // so the repair loop must give up gracefully instead of dropping tokens.
    const inventory = inventoryOf({
      terrain: { forest: 3 },
      numbers: { 6: 2, 8: 1 },
    });

    const layout = expectLayout(generate(inventory, 1));

    expect(layout.hexes.map((hex) => hex.numberToken).sort()).toEqual([
      6, 6, 8,
    ]);
    expect(adjacentRedPairs(layout.hexes)).toBeGreaterThan(0);
  });

  it("does not lose tokens on a board that is entirely red", () => {
    const inventory = inventoryOf({
      terrain: { forest: 9 },
      numbers: { 6: 5, 8: 4 },
    });

    const layout = expectLayout(generate(inventory, 1));

    const tokens = layout.hexes.map((hex) => hex.numberToken);
    expect(tokens.filter((value) => value === 6)).toHaveLength(5);
    expect(tokens.filter((value) => value === 8)).toHaveLength(4);
  });

  it("explores the exhaustive red placement search on a dense red board", () => {
    // Enough producing hexes and reds to enter the combinatorial search, but
    // few enough to stay under the 100k combination cap.
    const inventory = inventoryOf({
      terrain: { forest: 19 },
      numbers: { 5: 13, 6: 3, 8: 3 },
    });

    const layout = expectLayout(generate(inventory, 5));

    const tokens = layout.hexes.map((hex) => hex.numberToken);
    expect(tokens.filter((value) => value === 6)).toHaveLength(3);
    expect(tokens.filter((value) => value === 8)).toHaveLength(3);
    expect(tokens.filter((value) => value === 5)).toHaveLength(13);
    expect(adjacentRedPairs(layout.hexes)).toBe(0);
  });

  it("balances pips across resources when every token value is in play", () => {
    const inventory = inventoryOf({
      terrain: { forest: 4, pasture: 4, fields: 4, hills: 4, mountains: 4 },
      numbers: Object.fromEntries(
        NUMBER_TOKEN_VALUES.map((value) => [value, 2]),
      ),
    });

    const layout = expectLayout(generate(inventory, 7));

    const placed = layout.hexes
      .map((hex) => hex.numberToken)
      .filter((value): value is NumberTokenValue => value !== null)
      .sort((left, right) => left - right);
    expect(placed).toEqual(
      NUMBER_TOKEN_VALUES.flatMap((value) => [value, value]).sort(
        (left, right) => left - right,
      ),
    );
    expect(adjacentRedPairs(layout.hexes)).toBe(0);
  });

  it("bounds the number search on a large mixed-token board", () => {
    const inventory = inventoryOf({
      terrain: { forest: 30, pasture: 30, fields: 30 },
      numbers: Object.fromEntries(
        NUMBER_TOKEN_VALUES.map((value) => [value, 9]),
      ),
    });
    let draws = 0;
    const source = randomSequence(2);

    const layout = expectLayout(
      generateBoardLayout(
        inventory,
        (upperExclusive) => {
          draws += 1;
          return source(upperExclusive);
        },
        defaultFootprint(inventory),
      ),
    );

    expect(layout.hexes.filter((hex) => hex.numberToken !== null)).toHaveLength(
      90,
    );
    // Attempt counts are capped, so the draw budget must not scale with the
    // full search space of a 90-hex board.
    expect(draws).toBeLessThan(60_000);
  });
});

describe("port capacity repair", () => {
  it("reshapes the coastline via beam search to fit a demanding port count", () => {
    const inventory = inventoryOf({
      terrain: { forest: 13, sea: 12 },
      ports: { generic: 40 },
    });

    const layout = expectLayout(generate(inventory, 3));

    expect(layout.ports).toHaveLength(40);
    expect(coastEdgeCount(layout.hexes)).toBeGreaterThanOrEqual(40);
    assertHealthyLayout(layout, inventory);
  });

  it("uses the capped pair expansion on footprints larger than 40 hexes", () => {
    const inventory = inventoryOf({
      terrain: { forest: 17, sea: 24 },
      ports: { generic: 60 },
    });

    expect(hexCountOf(inventory)).toBeGreaterThan(40);
    const layout = expectLayout(generate(inventory, 17 * 131 + 24 * 7 + 60));

    expect(layout.ports).toHaveLength(60);
    assertHealthyLayout(layout, inventory);
  });

  it("falls back to greedy swaps when beam search stops short", () => {
    const inventory = inventoryOf({
      terrain: { forest: 20, sea: 16 },
      ports: { generic: 60 },
    });

    const layout = expectLayout(generate(inventory, 20 * 131 + 16 * 7 + 60));

    expect(layout.ports).toHaveLength(60);
    expect(coastEdgeCount(layout.hexes)).toBeGreaterThanOrEqual(60);
    assertHealthyLayout(layout, inventory);
  });

  it("reports failure instead of breaking islands when ports cannot fit", () => {
    const inventory = inventoryOf({
      terrain: { forest: 8, sea: 20 },
      ports: { generic: 60 },
    });

    expect(expectFailure(generate(inventory, 8 * 131 + 20 * 7 + 60))).toBe(
      PORT_FAILURE_MESSAGE,
    );
  });

  it("does not sacrifice minimum island size to gain coastline", () => {
    const inventory = inventoryOf({
      terrain: { forest: 9, sea: 10 },
      ports: { generic: 28 },
    });

    const layout = expectLayout(generate(inventory, 12));

    expect(layout.ports).toHaveLength(28);
    expect(Math.min(...landGroupSizes(layout.hexes))).toBeGreaterThanOrEqual(3);
  });
});

describe("port placement", () => {
  it("spreads ports around the coast instead of clustering them", () => {
    const inventory = inventoryOf({
      terrain: { forest: 5, pasture: 5, fields: 5, hills: 5, sea: 10 },
      numbers: { 5: 20 },
      ports: { generic: 4, forest: 1, pasture: 1 },
    });

    const layout = expectLayout(generate(inventory, 15));

    expect(layout.ports).toHaveLength(6);
    // Ports must not stack up on a single land hex when the coast is long.
    const perLandHex = new Map<string, number>();
    for (const port of layout.ports) {
      const key = coordinateKey(port.landCoordinate);
      perLandHex.set(key, (perLandHex.get(key) ?? 0) + 1);
    }
    expect(Math.max(...perLandHex.values())).toBeLessThanOrEqual(3);
    assertHealthyLayout(layout, inventory);
  });

  it("assigns exactly the requested port types", () => {
    const inventory = inventoryOf({
      terrain: { forest: 6, pasture: 6, sea: 8 },
      numbers: { 5: 12 },
      ports: { generic: 3, hills: 2, mountains: 1 },
    });

    const layout = expectLayout(generate(inventory, 23));

    const counts = new Map<PortType, number>();
    for (const port of layout.ports) {
      counts.set(port.type, (counts.get(port.type) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      generic: 3,
      hills: 2,
      mountains: 1,
    });
  });

  it("places a single port on a minimal coastline", () => {
    const inventory = inventoryOf({
      terrain: { forest: 3, sea: 4 },
      ports: { forest: 1 },
    });

    const layout = expectLayout(generate(inventory, 2));

    expect(layout.ports).toHaveLength(1);
    expect(layout.ports[0]?.type).toBe("forest");
    expect(isValidPortPlacement(layout.ports[0]!, layout.hexes)).toBe(true);
  });

  it("fills the entire coastline when every edge is requested", () => {
    const inventory = inventoryOf({
      terrain: { forest: 3, sea: 4 },
      ports: { generic: 8 },
    });

    const layout = expectLayout(generate(inventory, 7));

    expect(layout.ports).toHaveLength(8);
    expect(
      new Set(
        layout.ports.map((port) =>
          edgeKey(port.landCoordinate, port.direction),
        ),
      ).size,
    ).toBe(8);
    expect(coastEdgeCount(layout.hexes)).toBeGreaterThanOrEqual(8);
  });
});
