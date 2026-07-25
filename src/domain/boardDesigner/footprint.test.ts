import { describe, expect, it } from "vitest";
import {
  applyBoardCommand,
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  coordinateKey,
  createEmptyBoardInventory,
  createSymmetricContainingFootprint,
  createSymmetricFootprint,
  createSymmetricFootprintWithDimensions,
  footprintDimensions,
  generateBoardLayout,
  isConnected,
  isSymmetricFootprint,
  symmetricExpansionPairs,
  type BoardDesign,
} from "../index";

describe("symmetric board footprints", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 8, 37, 38])(
    "creates a connected 180-degree symmetric border with %i cells",
    (count) => {
      const result = createSymmetricFootprint(count);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }

      expect(result.value).toHaveLength(count);
      expect(isSymmetricFootprint(result.value)).toBe(true);
      expect(
        isConnected(
          result.value.map((coordinate) => ({
            coordinate,
            terrain: "sea",
            numberToken: null,
          })),
        ),
      ).toBe(true);
    },
  );

  it("adds and removes mirrored border pairs without changing other cells", () => {
    const initial = createSymmetricFootprint(5);
    if (!initial.ok) {
      throw new Error(initial.error.message);
    }
    const pair = symmetricExpansionPairs(initial.value)[0];
    if (!pair) {
      throw new Error("No expansion pair was available.");
    }
    let design = designWithFootprint(initial.value);

    const added = applyBoardCommand(design, {
      type: "footprint.pairAdded",
      coordinate: pair.first,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    design = added.value;
    expect(design.footprint).toHaveLength(7);
    expect(isSymmetricFootprint(design.footprint)).toBe(true);

    const removed = applyBoardCommand(design, {
      type: "footprint.pairRemoved",
      coordinate: pair.second,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) {
      return;
    }
    expect(new Set(removed.value.footprint.map(coordinateKey))).toEqual(
      new Set(initial.value.map(coordinateKey)),
    );
  });

  it("fills an adjusted footprint without changing its border", () => {
    const initial = createSymmetricFootprint(5);
    if (!initial.ok) {
      throw new Error(initial.error.message);
    }
    const pair = symmetricExpansionPairs(initial.value)[0];
    if (!pair) {
      throw new Error("No expansion pair was available.");
    }
    const design = applyBoardCommand(designWithFootprint(initial.value), {
      type: "footprint.pairAdded",
      coordinate: pair.first,
    });
    if (!design.ok) {
      throw new Error(design.error.message);
    }
    const inventory = createEmptyBoardInventory();
    inventory.terrain.forest = 3;
    inventory.terrain.sea = 4;

    const generated = generateBoardLayout(
      inventory,
      (upperExclusive) => upperExclusive - 1,
      design.value.footprint,
    );
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }
    expect(
      new Set(
        generated.value.hexes.map((hex) => coordinateKey(hex.coordinate)),
      ),
    ).toEqual(new Set(design.value.footprint.map(coordinateKey)));
  });

  it("creates an exact 9 × 5 border for 37 tiles", () => {
    const result = createSymmetricFootprintWithDimensions(37, 9, 5);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(37);
    expect(footprintDimensions(result.value)).toEqual({
      width: 9,
      height: 5,
    });
    expect(isSymmetricFootprint(result.value)).toBe(true);
    expect(isConnected(asFootprintHexes(result.value))).toBe(true);
  });

  it("supports a tall fixed-count border", () => {
    const result = createSymmetricFootprintWithDimensions(37, 5, 9);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(37);
    expect(footprintDimensions(result.value)).toEqual({
      width: 5,
      height: 9,
    });
  });

  it("rejects incompatible width and height requests", () => {
    expect(createSymmetricFootprintWithDimensions(37, 5, 5)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message:
          "5 × 5 holds only 25 cells, but the inventory contains 37 tiles.",
      },
    });
    expect(createSymmetricFootprintWithDimensions(37, 8, 5)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message:
          "Width × height must have the same odd or even parity as the tile count.",
      },
    });
  });

  it.each([
    { count: 4, height: 4, width: 4 },
    { count: 5, height: 5, width: 5 },
    { count: 6, height: 6, width: 5 },
  ])(
    "finds a bounded fallback for $count cells in $width × $height",
    ({ count, height, width }) => {
      const result = createSymmetricFootprintWithDimensions(
        count,
        width,
        height,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value).toHaveLength(count);
      expect(footprintDimensions(result.value)).toEqual({ height, width });
      expect(isConnected(asFootprintHexes(result.value))).toBe(true);
      expect(isSymmetricFootprint(result.value)).toBe(true);
    },
  );

  it("finds the smallest dynamic rotation center for legacy V shapes", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: 0, r: 1 },
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ]);

    expect(footprint).toHaveLength(4);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: 0, r: 0 },
        { q: 0, r: 1 },
        { q: 1, r: 0 },
        { q: 1, r: 1 },
      ]),
    );
    expect(isSymmetricFootprint(footprint)).toBe(true);
  });

  it("finds pair-sum rotation centers for legacy hook shapes", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: 0, r: 2 },
      { q: 1, r: -1 },
    ]);

    expect(footprint).toHaveLength(5);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: -1, r: 3 },
        { q: 0, r: 0 },
        { q: 0, r: 1 },
        { q: 0, r: 2 },
        { q: 1, r: -1 },
      ]),
    );
    expect(isSymmetricFootprint(footprint)).toBe(true);
  });

  it("returns an already connected mirrored closure without center paths", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ]);

    expect(footprint).toHaveLength(5);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: -1, r: -1 },
        { q: -1, r: 0 },
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 1, r: 1 },
      ]),
    );
    expect(
      isConnected(
        footprint.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ),
    ).toBe(true);
  });

  it("prefers shortest connectors that introduce fewer mirrored cells", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 1, r: -1 },
    ]);

    expect(footprint).toHaveLength(5);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 0 },
        { q: 1, r: -1 },
        { q: 1, r: 0 },
      ]),
    );
    expect(
      isConnected(
        footprint.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ),
    ).toBe(true);
  });

  it("counts the mirrored union across the complete shortest path", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: 1, r: -1 },
      { q: 0, r: 2 },
    ]);

    expect(footprint).toHaveLength(4);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: 0, r: 1 },
        { q: 0, r: 2 },
        { q: 1, r: -1 },
        { q: 1, r: 0 },
      ]),
    );
    expect(
      isConnected(
        footprint.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ),
    ).toBe(true);
  });

  it("prefers an exact standard target border when it contains legacy cells", () => {
    const standard = createSymmetricFootprint(7);
    if (!standard.ok) {
      throw new Error(standard.error.message);
    }
    const footprint = createSymmetricContainingFootprint(
      [
        { q: 1, r: -1 },
        { q: -1, r: 0 },
        { q: 0, r: 1 },
      ],
      7,
    );

    expect(footprint).toHaveLength(7);
    expect(footprint).toEqual(standard.value);
  });

  it("finds noncanonical exact target borders before adding capacity", () => {
    const footprint = createSymmetricContainingFootprint(
      [
        { q: 2, r: -1 },
        { q: -1, r: 2 },
      ],
      5,
    );

    expect(footprint).toHaveLength(5);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: 2, r: -1 },
        { q: -1, r: 2 },
      ]),
    );
    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(
      isConnected(
        footprint.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ),
    ).toBe(true);
  });
});

function designWithFootprint(footprint: BoardDesign["footprint"]): BoardDesign {
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("footprint-test"),
    revision: 0,
    name: "Footprint test",
    createdAt: asIsoTimestamp("2026-07-24T00:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-24T00:00:00.000Z"),
    inventory: createEmptyBoardInventory(),
    footprint,
    hexes: [],
    ports: [],
  };
}

function asFootprintHexes(
  coordinates: readonly BoardDesign["footprint"][number][],
) {
  return coordinates.map((coordinate) => ({
    coordinate,
    terrain: "sea" as const,
    numberToken: null,
  }));
}
