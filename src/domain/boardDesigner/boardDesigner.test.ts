import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyBoardCommand,
  areAdjacent,
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  connectedHexGroups,
  coordinateKey,
  createClassicIslandInventory,
  createEmptyBoardInventory,
  createSymmetricFootprint,
  generateBoardLayout,
  isConnected,
  isValidPortPlacement,
  neighbors,
  NUMBER_TOKEN_VALUES,
  placedInventory,
  validateBoardDesign,
  type BoardDesign,
  type BoardInventory,
  type BoardMutationResult,
} from "../index";

function makeDesign(
  inventory: BoardInventory = createClassicIslandInventory(),
): BoardDesign {
  const footprint = createSymmetricFootprint(
    Object.values(inventory.terrain).reduce((total, count) => total + count, 0),
  );
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("board-test"),
    revision: 0,
    name: "Test island",
    createdAt: asIsoTimestamp("2026-07-23T00:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-23T00:00:00.000Z"),
    inventory,
    footprint: footprint.ok ? footprint.value : [],
    hexes: [],
    ports: [],
  };
}

function accepted(result: BoardMutationResult<BoardDesign>): BoardDesign {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function randomSequence(seed: number): (upperExclusive: number) => number {
  let state = seed >>> 0;
  return (upperExclusive) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % upperExclusive;
  };
}

/**
 * A seeded source that also counts how many random draws generation needed.
 *
 * Generation is deterministic for a given seed, so the draw count is an exact,
 * machine-independent measure of how much search work was performed. The
 * "without blocking" tests assert on this instead of elapsed milliseconds:
 * wall-clock thresholds fail intermittently on loaded CI runners even when the
 * algorithm is unchanged, while a draw-count ceiling still catches the runaway
 * or unbounded search those tests exist to prevent.
 */
function countingRandomSequence(seed: number): {
  next: (upperExclusive: number) => number;
  readonly draws: number;
} {
  const next = randomSequence(seed);
  let draws = 0;
  return {
    next: (upperExclusive) => {
      draws += 1;
      return next(upperExclusive);
    },
    get draws() {
      return draws;
    },
  };
}

describe("board designer domain", () => {
  it("uses the balanced 37-tile default inventory", () => {
    const inventory = createClassicIslandInventory();
    expect(inventory.terrain).toEqual({
      forest: 5,
      pasture: 5,
      fields: 5,
      hills: 5,
      mountains: 5,
      gold: 2,
      desert: 0,
      sea: 10,
    });
    expect(
      Object.values(inventory.numbers).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(27);
    const counts = Object.values(inventory.numbers);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("places inventory-backed tiles, numbers, and edge ports", () => {
    let design = makeDesign();
    design = accepted(
      applyBoardCommand(design, {
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    );
    design = accepted(
      applyBoardCommand(design, {
        type: "hex.placed",
        coordinate: { q: 1, r: 0 },
        terrain: "sea",
      }),
    );
    design = accepted(
      applyBoardCommand(design, {
        type: "numberToken.set",
        coordinate: { q: 0, r: 0 },
        value: 6,
      }),
    );
    design = accepted(
      applyBoardCommand(design, {
        type: "port.set",
        landCoordinate: { q: 0, r: 0 },
        direction: 0,
        portType: "forest",
      }),
    );

    expect(design.hexes).toHaveLength(2);
    expect(design.hexes[0]?.numberToken).toBe(6);
    expect(design.ports).toEqual([
      {
        landCoordinate: { q: 0, r: 0 },
        direction: 0,
        type: "forest",
      },
    ]);
    expect(placedInventory(design).terrain).toMatchObject({
      forest: 1,
      sea: 1,
    });
  });

  it("keeps manual placement inside the border and conserves inventory", () => {
    let design = makeDesign();
    design = accepted(
      applyBoardCommand(design, {
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    );

    expect(
      applyBoardCommand(design, {
        type: "hex.placed",
        coordinate: { q: 99, r: 0 },
        terrain: "forest",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: "Place tiles inside the current board border.",
      },
    });

    expect(
      applyBoardCommand(design, {
        type: "inventory.countSet",
        category: "terrain",
        item: "forest",
        count: 0,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-count",
        message:
          "Remove placed items before reducing the inventory below that amount.",
      },
    });
  });

  it("treats Gold Field as producing terrain", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.gold = 1;
    inventory.numbers[5] = 1;
    let design = makeDesign(inventory);
    design = accepted(
      applyBoardCommand(design, {
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "gold",
      }),
    );
    design = accepted(
      applyBoardCommand(design, {
        type: "numberToken.set",
        coordinate: { q: 0, r: 0 },
        value: 5,
      }),
    );

    expect(design.hexes[0]).toMatchObject({
      terrain: "gold",
      numberToken: 5,
    });
    expect(
      validateBoardDesign(design).filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
  });

  it("generates a connected classic island without invalid placements", () => {
    const inventory = createClassicIslandInventory();
    const result = generateWithSymmetricFootprint(
      inventory,
      randomSequence(42),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const design = {
      ...makeDesign(inventory),
      ...result.value,
    };
    expect(result.value.hexes).toHaveLength(37);
    expect(
      new Set(result.value.hexes.map((hex) => coordinateKey(hex.coordinate)))
        .size,
    ).toBe(37);
    expect(isConnected(result.value.hexes)).toBe(true);
    expect(landComponentCount(result.value.hexes)).toBeGreaterThan(1);
    expect(minimumLandComponentSize(result.value.hexes)).toBeGreaterThanOrEqual(
      3,
    );
    expect(hasAdjacentSea(result.value.hexes)).toBe(true);
    expect(
      result.value.ports.every((port) =>
        isValidPortPlacement(port, result.value.hexes),
      ),
    ).toBe(true);
    expect(placedInventory(design).terrain).toEqual(inventory.terrain);
    expect(
      validateBoardDesign(design).filter(
        ({ severity }) => severity === "error",
      ),
    ).toEqual([]);
  });

  it("consistently keeps sea clusters and valid island sizes", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const result = generateWithSymmetricFootprint(
          createClassicIslandInventory(),
          randomSequence(seed),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        expect(
          minimumLandComponentSize(result.value.hexes),
        ).toBeGreaterThanOrEqual(3);
        expect(hasAdjacentSea(result.value.hexes)).toBe(true);
      }),
      { numRuns: 16 },
    );
  });

  it("repairs undersized islands even with a degenerate random source", () => {
    const result = generateWithSymmetricFootprint(
      createClassicIslandInventory(),
      () => 0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      connectedHexGroups(
        result.value.hexes,
        (hex) => hex.terrain !== "sea",
      ).every((group) => group.length >= 3),
    ).toBe(true);
  });

  it("re-optimizes red number tokens after terrain repair", () => {
    const result = generateWithSymmetricFootprint(
      createClassicIslandInventory(),
      randomSequence(11),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const design = {
      ...makeDesign(createClassicIslandInventory()),
      ...result.value,
    };

    expect(validateBoardDesign(design)).not.toContainEqual(
      expect.objectContaining({ code: "adjacent-red-numbers" }),
    );
  });

  it("finds a non-adjacent red-token placement when one exists", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 4;
    inventory.numbers[5] = 2;
    inventory.numbers[6] = 1;
    inventory.numbers[8] = 1;

    const result = generateWithSymmetricFootprint(inventory, randomSequence(0));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const design = {
      ...makeDesign(inventory),
      ...result.value,
    };

    expect(validateBoardDesign(design)).not.toContainEqual(
      expect.objectContaining({ code: "adjacent-red-numbers" }),
    );
  });

  it("places every selected port when the footprint has enough coastline", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 8;
    inventory.terrain.sea = 2;
    inventory.ports.generic = 8;

    const result = generateWithSymmetricFootprint(inventory, randomSequence(1));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.ports).toHaveLength(8);
    expect(
      connectedHexGroups(
        result.value.hexes,
        (hex) => hex.terrain !== "sea",
      ).every((group) => group.length >= 3),
    ).toBe(true);
  });

  it("crosses small-board coastline local maxima to place feasible ports", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 3;
    inventory.terrain.sea = 4;
    inventory.ports.generic = 8;

    const result = generateWithSymmetricFootprint(inventory, randomSequence(7));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.ports).toHaveLength(8);
    expect(
      connectedHexGroups(
        result.value.hexes,
        (hex) => hex.terrain !== "sea",
      ).map((group) => group.length),
    ).toEqual([3]);
  });

  it("uses exact coastline search for sparse land on larger footprints", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 3;
    inventory.terrain.sea = 12;
    inventory.ports.generic = 14;

    const result = generateWithSymmetricFootprint(inventory, randomSequence(2));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.ports).toHaveLength(14);
    expect(
      connectedHexGroups(
        result.value.hexes,
        (hex) => hex.terrain !== "sea",
      ).map((group) => group.length),
    ).toEqual([3]);
  });

  it("uses exact coastline search near the combination cap", () => {
    for (const seed of [0, 2]) {
      const inventory = createEmptyBoardInventory();
      inventory.terrain.forest = 9;
      inventory.terrain.sea = 10;
      inventory.ports.generic = 28;

      const result = generateWithSymmetricFootprint(
        inventory,
        randomSequence(seed),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        continue;
      }

      expect(result.value.ports).toHaveLength(28);
      expect(
        connectedHexGroups(
          result.value.hexes,
          (hex) => hex.terrain !== "sea",
        ).every((group) => group.length >= 3),
      ).toBe(true);
    }
  });

  it("places every feasible port on a larger symmetric border", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 11;
    inventory.terrain.sea = 9;
    inventory.ports.generic = 30;

    const result = generateWithSymmetricFootprint(inventory, randomSequence(5));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.ports).toHaveLength(30);
  });

  it("generates a maximum single-terrain numbered board without blocking", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 127;
    inventory.numbers[5] = 127;
    const random = countingRandomSequence(1);

    const result = generateWithSymmetricFootprint(inventory, random.next);

    expect(result.ok).toBe(true);
    // A single terrain and a single token value collapse both search loops to
    // one attempt, so this stays far below the mixed-inventory ceiling.
    expect(random.draws).toBeLessThan(2_000);
  });

  it("generates a maximum mixed-token board without blocking", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 127;
    for (const [index, value] of NUMBER_TOKEN_VALUES.entries()) {
      inventory.numbers[value] = index < 7 ? 13 : 12;
    }
    const random = countingRandomSequence(1);

    const result = generateWithSymmetricFootprint(inventory, random.next);

    expect(result.ok).toBe(true);
    // The largest supported board with every token value in play: attempts are
    // capped, so the work stays bounded rather than growing with the search.
    expect(random.draws).toBeLessThan(20_000);
  });

  it("warns about adjacent high-production numbers without blocking them", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 2;
    inventory.numbers[6] = 1;
    inventory.numbers[8] = 1;
    const design: BoardDesign = {
      ...makeDesign(inventory),
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
          numberToken: 6,
        },
        {
          coordinate: { q: 1, r: 0 },
          terrain: "forest",
          numberToken: 8,
        },
      ],
    };

    expect(
      areAdjacent(design.hexes[0]!.coordinate, design.hexes[1]!.coordinate),
    ).toBe(true);
    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "adjacent-red-numbers",
        severity: "warning",
      }),
    );
  });

  it("warns when a manual land island has fewer than three tiles", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 1;
    inventory.terrain.gold = 1;
    const design: BoardDesign = {
      ...makeDesign(inventory),
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
          numberToken: null,
        },
        {
          coordinate: { q: 1, r: 0 },
          terrain: "gold",
          numberToken: null,
        },
      ],
    };

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "small-island",
        severity: "warning",
      }),
    );
  });

  it("rejects generated boards with only one or two land tiles", () => {
    for (const landCount of [1, 2]) {
      const inventory = createEmptyBoardInventory();
      inventory.terrain.forest = landCount;
      inventory.terrain.sea = 5;

      expect(
        generateWithSymmetricFootprint(inventory, randomSequence(3)),
      ).toEqual({
        ok: false,
        error: {
          code: "invalid-layout",
          message: "Generated islands require at least three land hexes.",
        },
      });
    }
  });

  it("requires an explicit valid footprint before generation", () => {
    expect(
      generateBoardLayout(createClassicIslandInventory(), randomSequence(1)),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-layout",
        message:
          "Create a connected 180-degree symmetric border that matches the tile count before generating.",
      },
    });
  });

  it("does not let layout replacement create an arbitrary border", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 1;
    const design: BoardDesign = {
      ...makeDesign(inventory),
      footprint: [],
    };

    expect(
      applyBoardCommand(design, {
        type: "layout.replaced",
        layout: {
          hexes: [
            {
              coordinate: { q: 4, r: 4 },
              terrain: "forest",
              numberToken: null,
            },
          ],
          ports: [],
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message:
          "Create a connected 180-degree symmetric border before replacing the layout.",
      },
    });
  });

  it("preserves arbitrary terrain counts in generated connected layouts", () => {
    fc.assert(
      fc.property(
        fc.record({
          forest: fc.integer({ min: 0, max: 4 }),
          pasture: fc.integer({ min: 0, max: 4 }),
          fields: fc.integer({ min: 0, max: 4 }),
          hills: fc.integer({ min: 0, max: 4 }),
          mountains: fc.integer({ min: 0, max: 4 }),
          gold: fc.integer({ min: 0, max: 3 }),
          desert: fc.integer({ min: 0, max: 2 }),
          sea: fc.integer({ min: 0, max: 8 }),
        }),
        fc.integer(),
        (terrain, seed) => {
          if (Object.values(terrain).every((count) => count === 0)) {
            terrain.sea = 1;
          }
          const inventory = createEmptyBoardInventory();
          inventory.terrain = terrain;
          const result = generateWithSymmetricFootprint(
            inventory,
            randomSequence(seed),
          );
          const landCount =
            terrain.forest +
            terrain.pasture +
            terrain.fields +
            terrain.hills +
            terrain.mountains +
            terrain.gold +
            terrain.desert;
          if (landCount > 0 && landCount < 3) {
            expect(result.ok).toBe(false);
            return;
          }
          expect(result.ok).toBe(true);
          if (!result.ok) {
            return;
          }
          expect(isConnected(result.value.hexes)).toBe(true);
          expect(
            connectedHexGroups(
              result.value.hexes,
              (hex) => hex.terrain !== "sea",
            ).every((group) => group.length >= 3),
          ).toBe(true);
          const counts = createEmptyBoardInventory().terrain;
          for (const hex of result.value.hexes) {
            counts[hex.terrain] += 1;
          }
          expect(counts).toEqual(terrain);
        },
      ),
      { numRuns: 60 },
    );
  });
});

function landComponentCount(
  hexes: readonly BoardDesign["hexes"][number][],
): number {
  const landKeys = new Set(
    hexes
      .filter((hex) => hex.terrain !== "sea")
      .map((hex) => coordinateKey(hex.coordinate)),
  );
  const visited = new Set<string>();
  let components = 0;
  for (const hex of hexes) {
    const key = coordinateKey(hex.coordinate);
    if (hex.terrain === "sea" || visited.has(key)) {
      continue;
    }
    components += 1;
    const queue = [hex.coordinate];
    visited.add(key);
    while (queue.length > 0) {
      const coordinate = queue.shift();
      if (!coordinate) {
        continue;
      }
      for (const candidate of neighbors(coordinate)) {
        const candidateKey = coordinateKey(candidate);
        if (landKeys.has(candidateKey) && !visited.has(candidateKey)) {
          visited.add(candidateKey);
          queue.push(candidate);
        }
      }
    }
  }
  return components;
}

function generateWithSymmetricFootprint(
  inventory: BoardInventory,
  source: (upperExclusive: number) => number,
) {
  const count = Object.values(inventory.terrain).reduce(
    (total, value) => total + value,
    0,
  );
  const footprint = createSymmetricFootprint(count);
  if (!footprint.ok) {
    return footprint;
  }
  return generateBoardLayout(inventory, source, footprint.value);
}

function minimumLandComponentSize(
  hexes: readonly BoardDesign["hexes"][number][],
): number {
  const groups = connectedHexGroups(hexes, (hex) => hex.terrain !== "sea");
  return groups.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...groups.map((group) => group.length));
}

function hasAdjacentSea(
  hexes: readonly BoardDesign["hexes"][number][],
): boolean {
  const seaKeys = new Set(
    hexes
      .filter((hex) => hex.terrain === "sea")
      .map((hex) => coordinateKey(hex.coordinate)),
  );
  return hexes.some(
    (hex) =>
      hex.terrain === "sea" &&
      neighbors(hex.coordinate).some((candidate) =>
        seaKeys.has(coordinateKey(candidate)),
      ),
  );
}
