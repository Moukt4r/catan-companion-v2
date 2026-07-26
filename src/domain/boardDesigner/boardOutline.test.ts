/**
 * The table's own board outline.
 *
 * The default board is not a plain hexagon. It is a radius-3 hexagon stretched
 * by one row, giving a twenty-tile outer ring, then pinched by a single tile at
 * the top and bottom.
 *
 * These tests pin the shape itself rather than only its size. Asking the
 * generator for "a symmetric shape with N cells" constrains the total and the
 * 180-degree symmetry but nothing else, so it is free to bulge the middle to
 * make the numbers add up. That is exactly what happened before: a board with
 * three equal-height centre columns that summed correctly and looked nothing
 * like the real thing.
 */
import { describe, expect, it } from "vitest";
import {
  CLASSIC_BOARD_FOOTPRINT,
  coordinateKey,
  createClassicIslandInventory,
  generateBoardLayout,
  isConnected,
  isSymmetricFootprint,
  neighbors,
  totalTerrain,
} from "./index";
import type { HexCoordinate } from "./types";

function rowProfile(cells: readonly HexCoordinate[]): number[] {
  const rows = new Map<number, number>();
  for (const cell of cells) {
    rows.set(cell.r, (rows.get(cell.r) ?? 0) + 1);
  }
  return [...rows.keys()].sort((a, b) => a - b).map((r) => rows.get(r) ?? 0);
}

/** Cells missing at least one neighbour, i.e. the outer ring. */
function outerRing(cells: readonly HexCoordinate[]): HexCoordinate[] {
  const present = new Set(cells.map(coordinateKey));
  return cells.filter((cell) =>
    neighbors(cell).some((n) => !present.has(coordinateKey(n))),
  );
}

describe("the table's board outline", () => {
  it("holds forty-two tile positions", () => {
    expect(CLASSIC_BOARD_FOOTPRINT).toHaveLength(42);
  });

  it("has a twenty-tile outer ring", () => {
    // The count the table gets by walking the border, and the strongest single
    // check that the shape is right: a bulged board of the same size does not
    // produce twenty.
    expect(outerRing(CLASSIC_BOARD_FOOTPRINT)).toHaveLength(20);
  });

  it("tapers from the middle in both directions", () => {
    expect(rowProfile(CLASSIC_BOARD_FOOTPRINT)).toEqual([
      3, 5, 6, 7, 7, 6, 5, 3,
    ]);
  });

  it("never widens away from the centre", () => {
    // A hexagon grows to the middle and shrinks away from it. A bulge shows up
    // here as a row that is wider than the one before it on the way down.
    const profile = rowProfile(CLASSIC_BOARD_FOOTPRINT);
    const peak = profile.indexOf(Math.max(...profile));
    for (let i = 1; i <= peak; i += 1) {
      expect(profile[i]).toBeGreaterThanOrEqual(profile[i - 1] as number);
    }
    for (let i = peak + 1; i < profile.length; i += 1) {
      expect(profile[i]).toBeLessThanOrEqual(profile[i - 1] as number);
    }
  });

  it("is connected and 180-degree symmetric", () => {
    expect(isSymmetricFootprint(CLASSIC_BOARD_FOOTPRINT)).toBe(true);
    expect(
      isConnected(
        CLASSIC_BOARD_FOOTPRINT.map((coordinate) => ({
          coordinate,
          terrain: "sea" as const,
          numberToken: null,
        })),
      ),
    ).toBe(true);
  });

  it("holds no duplicate positions", () => {
    const keys = CLASSIC_BOARD_FOOTPRINT.map(coordinateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches the default inventory exactly", () => {
    // Generation refuses to run unless the tile count matches the outline, so
    // a mismatch silently disables the generate control.
    const inventory = createClassicIslandInventory();
    expect(totalTerrain(inventory)).toBe(CLASSIC_BOARD_FOOTPRINT.length);
    expect(inventory.terrain.sea).toBe(15);
    const land = totalTerrain(inventory) - inventory.terrain.sea;
    expect(land).toBe(27);
  });

  it("builds one mainland rather than an archipelago", () => {
    // The table lays out a single island, sometimes with one small satellite,
    // and the sea reads as bays cutting into that coast. An earlier generator
    // aimed for three separate land masses whenever there was enough sea,
    // which produced a scattering of similar-sized islands instead.
    for (let seed = 1; seed <= 12; seed += 1) {
      let state = seed * 2_654_435_761;
      const random = (upperExclusive: number) => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state % upperExclusive;
      };
      const result = generateBoardLayout(
        createClassicIslandInventory(),
        random,
        [...CLASSIC_BOARD_FOOTPRINT],
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const land = result.value.hexes.filter((hex) => hex.terrain !== "sea");
      const present = new Set(land.map((hex) => coordinateKey(hex.coordinate)));
      const seen = new Set<string>();
      const sizes: number[] = [];
      for (const hex of land) {
        const key = coordinateKey(hex.coordinate);
        if (seen.has(key)) continue;
        let size = 0;
        const queue = [hex.coordinate];
        seen.add(key);
        while (queue.length > 0) {
          const current = queue.pop() as HexCoordinate;
          size += 1;
          for (const next of neighbors(current)) {
            const nextKey = coordinateKey(next);
            if (present.has(nextKey) && !seen.has(nextKey)) {
              seen.add(nextKey);
              queue.push(next);
            }
          }
        }
        sizes.push(size);
      }
      sizes.sort((a, b) => b - a);

      expect(sizes.length).toBeLessThanOrEqual(2);
      // The mainland holds the clear majority of the land.
      expect(sizes[0] as number).toBeGreaterThanOrEqual(Math.ceil(27 * 0.7));
    }
  });

  it("generates a full board on the real outline", () => {
    let state = 2026;
    const random = (upperExclusive: number) => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state % upperExclusive;
    };
    const result = generateBoardLayout(createClassicIslandInventory(), random, [
      ...CLASSIC_BOARD_FOOTPRINT,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hexes).toHaveLength(42);
    expect(rowProfile(result.value.hexes.map((hex) => hex.coordinate))).toEqual(
      [3, 5, 6, 7, 7, 6, 5, 3],
    );
  });
});
