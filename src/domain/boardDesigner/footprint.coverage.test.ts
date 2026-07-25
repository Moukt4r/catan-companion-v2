import { describe, expect, it } from "vitest";
import {
  appendPair,
  connectedHexGroups,
  coordinateKey,
  createSymmetricContainingFootprint,
  createSymmetricFootprint,
  createSymmetricFootprintWithDimensions,
  findFootprintRotationOffset,
  findSymmetricPair,
  footprintDimensions,
  hexCenter,
  hexCornerPoints,
  isConnected,
  isSymmetricFootprint,
  MAX_BOARD_HEXES,
  neighbor,
  oppositeCoordinate,
  pixelBounds,
  portCenter,
  removePair,
  sortCoordinates,
  symmetricExpansionPairs,
  symmetricRemovalPairs,
  type BoardHex,
  type HexCoordinate,
  type HexDirection,
} from "../index";

const INVALID_FOOTPRINT_SIZE_MESSAGE = `A border must contain between 0 and ${MAX_BOARD_HEXES} cells.`;
const UNSATISFIABLE_DIMENSIONS_MESSAGE =
  "Those dimensions cannot hold this tile count while staying connected and symmetric.";

function asHexes(coordinates: readonly HexCoordinate[]): BoardHex[] {
  return coordinates.map((coordinate) => ({
    coordinate,
    terrain: "sea" as const,
    numberToken: null,
  }));
}

function keySet(coordinates: readonly HexCoordinate[]): Set<string> {
  return new Set(coordinates.map(coordinateKey));
}

describe("createSymmetricFootprint edge cases", () => {
  it.each([
    { label: "a negative count", count: -1 },
    { label: "a fractional count", count: 3.5 },
    { label: "NaN", count: Number.NaN },
    { label: "Infinity", count: Number.POSITIVE_INFINITY },
    { label: "a count above the board limit", count: MAX_BOARD_HEXES + 1 },
  ])("rejects $label", ({ count }) => {
    expect(createSymmetricFootprint(count)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: INVALID_FOOTPRINT_SIZE_MESSAGE,
      },
    });
  });

  it("accepts the largest allowed border and keeps it symmetric", () => {
    const result = createSymmetricFootprint(MAX_BOARD_HEXES);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(MAX_BOARD_HEXES);
    expect(keySet(result.value).size).toBe(MAX_BOARD_HEXES);
    expect(isSymmetricFootprint(result.value)).toBe(true);
    expect(isConnected(asHexes(result.value))).toBe(true);
  });

  it("returns cells sorted by row and then column", () => {
    const result = createSymmetricFootprint(19);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value).toEqual(sortCoordinates(result.value));
  });
});

describe("createSymmetricFootprintWithDimensions guard clauses", () => {
  it.each([
    { label: "a negative count", count: -1, width: 3, height: 3 },
    { label: "a fractional count", count: 2.5, width: 3, height: 3 },
    {
      label: "a count above the board limit",
      count: MAX_BOARD_HEXES + 1,
      width: 13,
      height: 13,
    },
  ])("rejects $label before looking at dimensions", (input) => {
    expect(
      createSymmetricFootprintWithDimensions(
        input.count,
        input.width,
        input.height,
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: INVALID_FOOTPRINT_SIZE_MESSAGE,
      },
    });
  });

  it("returns an empty border for zero tiles regardless of dimensions", () => {
    expect(createSymmetricFootprintWithDimensions(0, 9, 5)).toEqual({
      ok: true,
      value: [],
    });
  });

  it.each([
    { label: "a zero width", width: 0, height: 3 },
    { label: "a zero height", width: 3, height: 0 },
    { label: "a negative width", width: -3, height: 3 },
    { label: "a fractional height", width: 3, height: 2.5 },
    {
      label: "a width above the board limit",
      width: MAX_BOARD_HEXES + 1,
      height: 1,
    },
    {
      label: "a height above the board limit",
      width: 1,
      height: MAX_BOARD_HEXES + 1,
    },
  ])("rejects $label", ({ width, height }) => {
    expect(createSymmetricFootprintWithDimensions(5, width, height)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `Width and height must each be between 1 and ${MAX_BOARD_HEXES}.`,
      },
    });
  });

  it("rejects a grid larger than the maximum board even when it fits the count", () => {
    expect(createSymmetricFootprintWithDimensions(10, 12, 12)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `Width × height may contain at most ${MAX_BOARD_HEXES} cells.`,
      },
    });
  });

  it("reports the unreachable-shape error when no bounded fallback exists", () => {
    expect(createSymmetricFootprintWithDimensions(1, 1, 3)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: UNSATISFIABLE_DIMENSIONS_MESSAGE,
      },
    });
    expect(createSymmetricFootprintWithDimensions(2, 1, 4)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: UNSATISFIABLE_DIMENSIONS_MESSAGE,
      },
    });
  });

  it("gives up on large counts that exceed the bounded fallback search", () => {
    expect(createSymmetricFootprintWithDimensions(13, 1, 15)).toEqual({
      ok: false,
      error: {
        code: "invalid-footprint",
        message: UNSATISFIABLE_DIMENSIONS_MESSAGE,
      },
    });
  });

  it.each([
    { count: 2, width: 2, height: 3 },
    { count: 4, width: 2, height: 5 },
  ])(
    "reports failure when $count cells cannot span a $width × $height grid",
    ({ count, height, width }) => {
      expect(
        createSymmetricFootprintWithDimensions(count, width, height),
      ).toEqual({
        ok: false,
        error: {
          code: "invalid-footprint",
          message: UNSATISFIABLE_DIMENSIONS_MESSAGE,
        },
      });
    },
  );

  it("keeps the full grid when the count exactly fills it", () => {
    const result = createSymmetricFootprintWithDimensions(15, 5, 3);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(15);
    expect(footprintDimensions(result.value)).toEqual({ width: 5, height: 3 });
    expect(keySet(result.value).size).toBe(15);
  });

  it.each([
    { count: 1, width: 1, height: 1 },
    { count: 2, width: 2, height: 2 },
    { count: 3, width: 3, height: 3 },
    { count: 13, width: 13, height: 1 },
    { count: 13, width: 5, height: 3 },
    { count: 14, width: 4, height: 4 },
    { count: 20, width: 6, height: 4 },
    { count: 4, width: 2, height: 3 },
    { count: 6, width: 2, height: 5 },
    { count: 8, width: 2, height: 5 },
    { count: 2, width: 2, height: 1 },
  ])(
    "trims a $width × $height grid down to $count connected symmetric cells",
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
      expect(keySet(result.value).size).toBe(count);
      expect(footprintDimensions(result.value)).toEqual({ height, width });
      expect(isSymmetricFootprint(result.value)).toBe(true);
      expect(isConnected(asHexes(result.value))).toBe(true);
    },
  );
});

describe("footprintDimensions", () => {
  it("reports zero size for an empty footprint", () => {
    expect(footprintDimensions([])).toEqual({ height: 0, width: 0 });
  });

  it("reports a single cell as one by one", () => {
    expect(footprintDimensions([{ q: 4, r: -7 }])).toEqual({
      height: 1,
      width: 1,
    });
  });

  it("spans the inclusive extent of scattered cells", () => {
    expect(
      footprintDimensions([
        { q: -2, r: 3 },
        { q: 5, r: -1 },
        { q: 0, r: 0 },
      ]),
    ).toEqual({ height: 5, width: 8 });
  });
});

describe("findFootprintRotationOffset and isSymmetricFootprint", () => {
  it("treats an empty footprint as symmetric about the origin", () => {
    expect(findFootprintRotationOffset([])).toEqual({ q: 0, r: 0 });
    expect(isSymmetricFootprint([])).toBe(true);
  });

  it("returns the doubled center for a single cell", () => {
    const offset = findFootprintRotationOffset([{ q: 3, r: -2 }]);

    expect(offset).toEqual({ q: 6, r: -4 });
    expect(
      oppositeCoordinate({ q: 3, r: -2 }, offset ?? { q: 0, r: 0 }),
    ).toEqual({ q: 3, r: -2 });
  });

  it("returns null for a shape with no 180-degree center", () => {
    const wedge = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ];

    expect(findFootprintRotationOffset(wedge)).toBeNull();
    expect(isSymmetricFootprint(wedge)).toBe(false);
  });

  it("finds a center for a shape whose rotation center is not a cell", () => {
    const offset = findFootprintRotationOffset([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);

    expect(offset).toEqual({ q: 1, r: 0 });
  });

  it("maps every cell onto another cell for the reported offset", () => {
    const ring = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    const offset = findFootprintRotationOffset(ring);
    expect(offset).not.toBeNull();
    if (!offset) {
      return;
    }
    const keys = keySet(ring);

    for (const coordinate of ring) {
      expect(
        keys.has(coordinateKey(oppositeCoordinate(coordinate, offset))),
      ).toBe(true);
    }
  });
});

describe("oppositeCoordinate", () => {
  it("mirrors through the origin by default", () => {
    expect(oppositeCoordinate({ q: 2, r: -3 })).toEqual({ q: -2, r: 3 });
  });

  it("is its own inverse for any offset", () => {
    const offset = { q: 3, r: -1 };
    const coordinate = { q: 5, r: 2 };

    expect(
      oppositeCoordinate(oppositeCoordinate(coordinate, offset), offset),
    ).toEqual(coordinate);
  });
});

describe("symmetricExpansionPairs", () => {
  it("offers the origin as the only seed for an empty footprint", () => {
    expect(symmetricExpansionPairs([])).toEqual([
      { first: { q: 0, r: 0 }, second: { q: 0, r: 0 } },
    ]);
  });

  it("offers nothing for an asymmetric footprint", () => {
    expect(
      symmetricExpansionPairs([
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ]),
    ).toEqual([]);
  });

  it("never offers a self-paired cell that would break the count by one", () => {
    const ring = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    const pairs = symmetricExpansionPairs(ring);

    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(coordinateKey(pair.first)).not.toBe(coordinateKey(pair.second));
    }
    expect(
      pairs.some(
        (pair) =>
          coordinateKey(pair.first) === "0,0" ||
          coordinateKey(pair.second) === "0,0",
      ),
    ).toBe(false);
  });

  it("only offers pairs that keep the footprint connected", () => {
    const gapped = [
      { q: 0, r: 0 },
      { q: 3, r: 0 },
    ];
    const pairs = symmetricExpansionPairs(gapped);

    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(isConnected(asHexes(appendPair(gapped, pair)))).toBe(true);
    }
    expect(
      pairs.some(
        (pair) =>
          coordinateKey(pair.first) === "1,0" &&
          coordinateKey(pair.second) === "2,0",
      ),
    ).toBe(true);
  });

  it("orders pairs closest to the origin first", () => {
    const line = [
      { q: -2, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ];
    const pairs = symmetricExpansionPairs(line);

    expect(pairs.length).toBeGreaterThan(1);
    for (const pair of pairs) {
      const next = appendPair(line, pair);
      expect(next).toHaveLength(line.length + 2);
      expect(isSymmetricFootprint(next)).toBe(true);
      expect(isConnected(asHexes(next))).toBe(true);
    }
  });
});

describe("symmetricRemovalPairs", () => {
  it("offers nothing for an asymmetric footprint", () => {
    expect(
      symmetricRemovalPairs([
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ]),
    ).toEqual([]);
  });

  it("offers nothing for an empty footprint", () => {
    expect(symmetricRemovalPairs([])).toEqual([]);
  });

  it("allows clearing the last remaining cell", () => {
    expect(symmetricRemovalPairs([{ q: 0, r: 0 }])).toEqual([
      { first: { q: 0, r: 0 }, second: { q: 0, r: 0 } },
    ]);
  });

  it("keeps the border connected and symmetric after any offered removal", () => {
    const base = createSymmetricFootprint(19);
    if (!base.ok) {
      throw new Error(base.error.message);
    }
    const pairs = symmetricRemovalPairs(base.value);

    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      const next = removePair(base.value, pair);
      expect(next).toHaveLength(base.value.length - 2);
      expect(isConnected(asHexes(next))).toBe(true);
      expect(isSymmetricFootprint(next)).toBe(true);
    }
  });

  it("never offers a fully enclosed cell", () => {
    const base = createSymmetricFootprint(19);
    if (!base.ok) {
      throw new Error(base.error.message);
    }
    const keys = keySet(base.value);
    const enclosed = base.value.filter(
      (coordinate) =>
        neighbors6(coordinate).filter((candidate) =>
          keys.has(coordinateKey(candidate)),
        ).length === 6,
    );
    expect(enclosed.length).toBeGreaterThan(0);
    const offered = symmetricRemovalPairs(base.value);

    for (const coordinate of enclosed) {
      expect(findSymmetricPair(offered, coordinate)).toBeUndefined();
    }
  });
});

describe("findSymmetricPair", () => {
  it("matches on either half of a pair", () => {
    const pairs = [
      { first: { q: 0, r: -1 }, second: { q: 0, r: 1 } },
      { first: { q: -1, r: 0 }, second: { q: 1, r: 0 } },
    ];

    expect(findSymmetricPair(pairs, { q: 0, r: 1 })).toBe(pairs[0]);
    expect(findSymmetricPair(pairs, { q: -1, r: 0 })).toBe(pairs[1]);
    expect(findSymmetricPair(pairs, { q: 9, r: 9 })).toBeUndefined();
    expect(findSymmetricPair([], { q: 0, r: 0 })).toBeUndefined();
  });
});

describe("appendPair and removePair", () => {
  it("copies coordinates instead of sharing references", () => {
    const base = [{ q: 0, r: 0 }];
    const pair = { first: { q: 1, r: 0 }, second: { q: -1, r: 0 } };
    const next = appendPair(base, pair);

    expect(next).toHaveLength(3);
    expect(next).not.toContain(pair.first);
    expect(next).not.toContain(pair.second);
    expect(base).toHaveLength(1);
  });

  it("deduplicates a pair that is already present", () => {
    const base = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];

    expect(
      appendPair(base, { first: { q: 1, r: 0 }, second: { q: 0, r: 0 } }),
    ).toHaveLength(2);
  });

  it("removes only the requested cells and leaves the input untouched", () => {
    const base = [
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const next = removePair(base, {
      first: { q: -1, r: 0 },
      second: { q: 1, r: 0 },
    });

    expect(next).toEqual([{ q: 0, r: 0 }]);
    expect(next[0]).not.toBe(base[1]);
    expect(base).toHaveLength(3);
  });

  it("ignores a removal pair that is not part of the footprint", () => {
    const base = [{ q: 0, r: 0 }];

    expect(
      removePair(base, { first: { q: 5, r: 5 }, second: { q: -5, r: -5 } }),
    ).toEqual(base);
  });
});

describe("createSymmetricContainingFootprint", () => {
  it("returns nothing for an empty selection without a target", () => {
    expect(createSymmetricContainingFootprint([])).toEqual([]);
  });

  it("falls back to the standard border for an empty selection with a target", () => {
    const standard = createSymmetricFootprint(7);
    if (!standard.ok) {
      throw new Error(standard.error.message);
    }

    expect(createSymmetricContainingFootprint([], 7)).toEqual(standard.value);
  });

  it("returns nothing when the empty-selection target is itself invalid", () => {
    expect(createSymmetricContainingFootprint([], MAX_BOARD_HEXES + 1)).toEqual(
      [],
    );
  });

  it("keeps an already symmetric selection unchanged", () => {
    expect(createSymmetricContainingFootprint([{ q: 0, r: 0 }])).toEqual([
      { q: 0, r: 0 },
    ]);
    expect(
      createSymmetricContainingFootprint([
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ]),
    ).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it("bridges a gap between two mirrored islands", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: 0, r: 0 },
      { q: 3, r: 0 },
    ]);

    expect(footprint).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(isConnected(asHexes(footprint))).toBe(true);
  });

  it("grows a selection to an exact even target", () => {
    const footprint = createSymmetricContainingFootprint(
      [
        { q: 0, r: 0 },
        { q: 2, r: 1 },
      ],
      6,
    );

    expect(footprint).toHaveLength(6);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: 0, r: 0 },
        { q: 2, r: 1 },
      ]),
    );
    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(isConnected(asHexes(footprint))).toBe(true);
  });

  it("grows past a target that the mirrored closure already exceeds", () => {
    const wedge = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ];
    const footprint = createSymmetricContainingFootprint(wedge, 3);

    expect(footprint).toHaveLength(4);
    expect(footprint).toEqual(
      expect.arrayContaining([
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ]),
    );
    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(isConnected(asHexes(footprint))).toBe(true);
  });

  it("ignores a target smaller than the selection itself", () => {
    const selection = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 0, r: 1 },
    ];
    const footprint = createSymmetricContainingFootprint(selection, 3);

    const keys = keySet(footprint);
    expect(footprint.length).toBeGreaterThanOrEqual(selection.length);
    expect(keys.size).toBe(footprint.length);
    for (const coordinate of selection) {
      expect(keys.has(coordinateKey(coordinate))).toBe(true);
    }
    expect(isSymmetricFootprint(footprint)).toBe(true);
  });

  it("expands by mirrored pairs when the target is far beyond the selection", () => {
    const footprint = createSymmetricContainingFootprint(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      40,
    );

    expect(footprint).toHaveLength(40);
    expect(keySet(footprint).size).toBe(40);
    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(isConnected(asHexes(footprint))).toBe(true);
  });

  it("returns a standard border unchanged when it already matches the target", () => {
    const standard = createSymmetricFootprint(37);
    if (!standard.ok) {
      throw new Error(standard.error.message);
    }
    const footprint = createSymmetricContainingFootprint(standard.value, 37);

    expect(footprint).toHaveLength(37);
    expect(keySet(footprint)).toEqual(keySet(standard.value));
  });

  it("connects distant mirrored islands with a monotone path", () => {
    const footprint = createSymmetricContainingFootprint([
      { q: 0, r: 0 },
      { q: 14, r: 14 },
    ]);

    expect(isSymmetricFootprint(footprint)).toBe(true);
    expect(isConnected(asHexes(footprint))).toBe(true);
    expect(keySet(footprint).size).toBe(footprint.length);
    expect(keySet(footprint).has("0,0")).toBe(true);
    expect(keySet(footprint).has("14,14")).toBe(true);
    expect(connectedHexGroups(asHexes(footprint))).toHaveLength(1);
  });

  it.each([
    {
      label: "an even target",
      target: 40,
      selection: [
        { q: 0, r: 0 },
        { q: 6, r: 0 },
      ],
    },
    {
      label: "an odd target",
      target: 61,
      selection: [
        { q: 0, r: 0 },
        { q: 6, r: 0 },
      ],
    },
    {
      label: "a diagonal selection",
      target: 50,
      selection: [
        { q: 5, r: -2 },
        { q: -2, r: 5 },
      ],
    },
    {
      label: "a three-cell selection",
      target: 33,
      selection: [
        { q: 2, r: -1 },
        { q: -1, r: 2 },
        { q: 4, r: 0 },
      ],
    },
  ])(
    "reaches $label above the standard-border shortcut",
    ({ selection, target }) => {
      const footprint = createSymmetricContainingFootprint(selection, target);

      expect(footprint).toHaveLength(target);
      expect(keySet(footprint).size).toBe(target);
      expect(isSymmetricFootprint(footprint)).toBe(true);
      expect(isConnected(asHexes(footprint))).toBe(true);
      for (const coordinate of selection) {
        expect(keySet(footprint).has(coordinateKey(coordinate))).toBe(true);
      }
    },
  );

  it("pads a symmetric line outwards to reach a small target", () => {
    expect(
      createSymmetricContainingFootprint(
        [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
          { q: 2, r: 0 },
        ],
        5,
      ),
    ).toEqual([
      { q: -2, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it.each([
    {
      label: "a long diagonal",
      selection: [
        { q: 0, r: 0 },
        { q: 20, r: -10 },
      ],
    },
    {
      label: "a long shear",
      selection: [
        { q: 0, r: 0 },
        { q: 20, r: -7 },
      ],
    },
  ])(
    "bridges $label that exceeds the wide-path search limit",
    ({ selection }) => {
      const footprint = createSymmetricContainingFootprint(selection);

      expect(isSymmetricFootprint(footprint)).toBe(true);
      expect(isConnected(asHexes(footprint))).toBe(true);
      expect(keySet(footprint).size).toBe(footprint.length);
      for (const coordinate of selection) {
        expect(keySet(footprint).has(coordinateKey(coordinate))).toBe(true);
      }
    },
  );

  it("keeps a long straight selection as-is instead of padding it", () => {
    const line = Array.from({ length: 21 }, (_, index) => ({
      q: index,
      r: 0,
    }));
    const footprint = createSymmetricContainingFootprint([
      { q: 0, r: 0 },
      { q: 20, r: 0 },
    ]);

    expect(footprint).toEqual(line);
  });
});

describe("coordinate helpers", () => {
  it("throws for an unknown hex direction", () => {
    expect(() => neighbor({ q: 0, r: 0 }, 6 as HexDirection)).toThrow(
      "Unknown hex direction 6.",
    );
    expect(() => neighbor({ q: 0, r: 0 }, -1 as HexDirection)).toThrow(
      "Unknown hex direction -1.",
    );
  });

  it("sorts coordinates by row and then column without mutating the input", () => {
    const input = [
      { q: 1, r: 1 },
      { q: -1, r: 1 },
      { q: 0, r: -1 },
    ];
    const sorted = sortCoordinates(input);

    expect(sorted).toEqual([
      { q: 0, r: -1 },
      { q: -1, r: 1 },
      { q: 1, r: 1 },
    ]);
    expect(input[0]).toEqual({ q: 1, r: 1 });
  });

  it("places the origin hex at the pixel origin", () => {
    expect(hexCenter({ q: 0, r: 0 }, 20)).toEqual({ x: 0, y: 0 });
  });

  it("spaces flat-top hex centers by 1.5 × size horizontally", () => {
    const size = 20;
    const left = hexCenter({ q: 0, r: 0 }, size);
    const right = hexCenter({ q: 1, r: 0 }, size);

    expect(right.x - left.x).toBeCloseTo(1.5 * size, 10);
    expect(right.y - left.y).toBeCloseTo((Math.sqrt(3) / 2) * size, 10);
  });

  it("spaces hex centers by √3 × size vertically within a column", () => {
    const size = 20;
    const top = hexCenter({ q: 2, r: 0 }, size);
    const below = hexCenter({ q: 2, r: 1 }, size);

    expect(below.x).toBeCloseTo(top.x, 10);
    expect(below.y - top.y).toBeCloseTo(Math.sqrt(3) * size, 10);
  });

  it("returns six corners on the circumscribed circle", () => {
    const size = 12;
    const center = hexCenter({ q: 1, r: -1 }, size);
    const corners = hexCornerPoints({ q: 1, r: -1 }, size);

    expect(corners).toHaveLength(6);
    for (const corner of corners) {
      expect(Math.hypot(corner.x - center.x, corner.y - center.y)).toBeCloseTo(
        size,
        10,
      );
    }
    expect(corners[0]).toEqual({ x: center.x + size, y: center.y });
  });

  it("puts a port halfway between its land and sea hex", () => {
    const size = 10;
    const land = { q: 0, r: 0 };
    const direction: HexDirection = 3;
    const seaCenter = hexCenter(neighbor(land, direction), size);
    const landCenter = hexCenter(land, size);

    expect(portCenter(land, direction, size)).toEqual({
      x: (landCenter.x + seaCenter.x) / 2,
      y: (landCenter.y + seaCenter.y) / 2,
    });
  });

  it("returns a symmetric padded box for an empty coordinate list", () => {
    expect(pixelBounds([], 10)).toEqual({
      minX: -20,
      minY: -20,
      maxX: 20,
      maxY: 20,
      width: 40,
      height: 40,
    });
  });

  it("honours an explicit padding for an empty coordinate list", () => {
    expect(pixelBounds([], 10, 0)).toEqual({
      minX: -10,
      minY: -10,
      maxX: 10,
      maxY: 10,
      width: 20,
      height: 20,
    });
  });

  it("wraps a single hex in its own bounding box", () => {
    const bounds = pixelBounds([{ q: 0, r: 0 }], 10, 0);

    expect(bounds.minX).toBeCloseTo(-10, 10);
    expect(bounds.maxX).toBeCloseTo(10, 10);
    expect(bounds.minY).toBeCloseTo(-(Math.sqrt(3) / 2) * 10, 10);
    expect(bounds.maxY).toBeCloseTo((Math.sqrt(3) / 2) * 10, 10);
    expect(bounds.width).toBeCloseTo(20, 10);
    expect(bounds.height).toBeCloseTo(Math.sqrt(3) * 10, 10);
  });

  it("grows the bounding box to cover every hex plus padding", () => {
    const size = 10;
    const padding = 4;
    const coordinates = [
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 2, r: 1 },
    ];
    const bounds = pixelBounds(coordinates, size, padding);

    for (const coordinate of coordinates) {
      const center = hexCenter(coordinate, size);
      expect(center.x - size).toBeGreaterThanOrEqual(bounds.minX);
      expect(center.x + size).toBeLessThanOrEqual(bounds.maxX);
      expect(center.y).toBeGreaterThan(bounds.minY);
      expect(center.y).toBeLessThan(bounds.maxY);
    }
    expect(bounds.width).toBeCloseTo(bounds.maxX - bounds.minX, 10);
    expect(bounds.height).toBeCloseTo(bounds.maxY - bounds.minY, 10);
  });
});

function neighbors6(coordinate: HexCoordinate): HexCoordinate[] {
  return ([0, 1, 2, 3, 4, 5] as const).map((direction) =>
    neighbor(coordinate, direction),
  );
}
