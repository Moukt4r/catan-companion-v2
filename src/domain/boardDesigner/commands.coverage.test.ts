import { describe, expect, it } from "vitest";
import {
  applyBoardCommand,
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  cloneInventory,
  createClassicIslandInventory,
  createEmptyBoardInventory,
  inventoryFitsDesign,
  MAX_BOARD_HEXES,
  placedInventory,
  producingTerrainCount,
  remainingInventory,
  setNumberCount,
  setPortCount,
  setTerrainCount,
  validateBoardDesign,
  type BoardCommand,
  type BoardDesign,
  type BoardHex,
  type BoardInventory,
  type BoardMutationError,
  type BoardMutationResult,
  type BoardPort,
  type GeneratedBoardLayout,
  type HexCoordinate,
} from "../index";

/**
 * A straight row of `count` cells is always a legal board border: it is
 * connected, and rotating it 180 degrees about `{ q: count - 1, r: 0 }` maps
 * cell `i` onto cell `count - 1 - i`. That makes it the cheapest fixture for
 * exercising border-dependent command paths without generating a real island.
 */
function row(count: number): HexCoordinate[] {
  return Array.from({ length: count }, (_, index) => ({ q: index, r: 0 }));
}

function makeDesign(overrides: Partial<BoardDesign> = {}): BoardDesign {
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("board-coverage"),
    revision: 0,
    name: "Coverage island",
    createdAt: asIsoTimestamp("2026-07-25T00:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-25T00:00:00.000Z"),
    inventory: createEmptyBoardInventory(),
    footprint: [],
    hexes: [],
    ports: [],
    ...overrides,
  };
}

function inventoryWith(
  overrides: {
    terrain?: Partial<BoardInventory["terrain"]>;
    numbers?: Partial<BoardInventory["numbers"]>;
    ports?: Partial<BoardInventory["ports"]>;
  } = {},
): BoardInventory {
  const inventory = createEmptyBoardInventory();
  Object.assign(inventory.terrain, overrides.terrain ?? {});
  Object.assign(inventory.numbers, overrides.numbers ?? {});
  Object.assign(inventory.ports, overrides.ports ?? {});
  return inventory;
}

function accepted(result: BoardMutationResult<BoardDesign>): BoardDesign {
  if (!result.ok) {
    throw new Error(
      `Expected the command to be accepted: ${result.error.code}`,
    );
  }
  return result.value;
}

function rejected(
  result: BoardMutationResult<BoardDesign>,
): BoardMutationError {
  if (result.ok) {
    throw new Error("Expected the command to be rejected.");
  }
  return result.error;
}

function apply(
  design: BoardDesign,
  command: BoardCommand,
): BoardMutationResult<BoardDesign> {
  return applyBoardCommand(design, command);
}

/** Land at (0,0) and (2,0), sea at (1,0), with a port from (0,0) into the sea. */
function coastalDesign(inventory: BoardInventory): BoardDesign {
  const hexes: BoardHex[] = [
    { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
    { coordinate: { q: 1, r: 0 }, terrain: "sea", numberToken: null },
    { coordinate: { q: 2, r: 0 }, terrain: "forest", numberToken: null },
  ];
  const ports: BoardPort[] = [
    { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
  ];
  return makeDesign({ inventory, footprint: row(3), hexes, ports });
}

const coastalInventory = () =>
  inventoryWith({
    terrain: { forest: 3, sea: 1, desert: 1, gold: 1 },
    numbers: { 6: 1, 8: 1 },
    ports: { generic: 1, forest: 1 },
  });

describe("applyBoardCommand — design.renamed", () => {
  it("rejects blank names and names longer than 80 characters", () => {
    const design = makeDesign();
    const blank = rejected(
      apply(design, { type: "design.renamed", name: "   \n\t " }),
    );
    expect(blank).toEqual({
      code: "invalid-name",
      message: "Board names must contain between 1 and 80 characters.",
    });

    expect(
      rejected(apply(design, { type: "design.renamed", name: "x".repeat(81) })),
    ).toMatchObject({ code: "invalid-name" });
  });

  it("accepts a trimmed name at the 80-character boundary", () => {
    const design = makeDesign();
    // 80 content characters plus surrounding whitespace: trimming must happen
    // before the length check, otherwise this would be rejected.
    const next = accepted(
      apply(design, { type: "design.renamed", name: `  ${"x".repeat(80)}  ` }),
    );
    expect(next.name).toBe("x".repeat(80));
    expect(design.name).toBe("Coverage island");
  });
});

describe("applyBoardCommand — inventory.countSet", () => {
  const design = makeDesign({ inventory: createClassicIslandInventory() });

  it.each([
    ["a fractional count", 1.5],
    ["a negative count", -1],
    ["a count above the hex ceiling", MAX_BOARD_HEXES + 1],
  ])("rejects %s", (_label, count) => {
    expect(
      rejected(
        apply(design, {
          type: "inventory.countSet",
          category: "terrain",
          item: "forest",
          count,
        }),
      ),
    ).toEqual({
      code: "invalid-count",
      message: `Inventory counts must be between 0 and ${MAX_BOARD_HEXES}.`,
    });
  });

  it("refuses to drop a number-token count below the placed tokens", () => {
    const placedToken = makeDesign({
      inventory: inventoryWith({ terrain: { forest: 1 }, numbers: { 6: 1 } }),
      footprint: row(1),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: 6 },
      ],
    });

    expect(
      rejected(
        apply(placedToken, {
          type: "inventory.countSet",
          category: "number",
          item: 6,
          count: 0,
        }),
      ),
    ).toEqual({
      code: "invalid-count",
      message:
        "Remove placed items before reducing the inventory below that amount.",
    });
  });

  it("refuses to drop a port count below the placed ports", () => {
    expect(
      rejected(
        apply(coastalDesign(coastalInventory()), {
          type: "inventory.countSet",
          category: "port",
          item: "generic",
          count: 0,
        }),
      ),
    ).toMatchObject({ code: "invalid-count" });
  });

  it("updates number and port counts while leaving the other categories alone", () => {
    const withNumbers = accepted(
      apply(design, {
        type: "inventory.countSet",
        category: "number",
        item: 8,
        count: 4,
      }),
    );
    expect(withNumbers.inventory.numbers[8]).toBe(4);
    expect(withNumbers.inventory.terrain).toEqual(design.inventory.terrain);
    expect(withNumbers.inventory.ports).toEqual(design.inventory.ports);

    const withPorts = accepted(
      apply(withNumbers, {
        type: "inventory.countSet",
        category: "port",
        item: "mountains",
        count: 3,
      }),
    );
    expect(withPorts.inventory.ports.mountains).toBe(3);
    expect(withPorts.inventory.numbers[8]).toBe(4);
    // The original design is never mutated in place.
    expect(design.inventory.numbers[8]).toBe(
      createClassicIslandInventory().numbers[8],
    );
  });

  it("rejects a terrain count that would push the board past the hex ceiling", () => {
    const packed = makeDesign({
      inventory: inventoryWith({ terrain: { sea: MAX_BOARD_HEXES } }),
    });

    expect(
      rejected(
        apply(packed, {
          type: "inventory.countSet",
          category: "terrain",
          item: "forest",
          count: 1,
        }),
      ),
    ).toEqual({
      code: "invalid-count",
      message: `A design can contain at most ${MAX_BOARD_HEXES} hexes.`,
    });
  });
});

describe("applyBoardCommand — hex.placed", () => {
  const inventory = () => inventoryWith({ terrain: { forest: 1, sea: 1 } });

  it.each([
    ["an out-of-range coordinate", { q: MAX_BOARD_HEXES + 1, r: 0 }],
    ["a fractional coordinate", { q: 0.5, r: 0 }],
  ])("rejects %s", (_label, coordinate) => {
    expect(
      rejected(
        apply(makeDesign({ inventory: inventory(), footprint: row(2) }), {
          type: "hex.placed",
          coordinate,
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "invalid-layout",
      message: "The hex coordinate is invalid.",
    });
  });

  it("rejects placing onto an occupied cell", () => {
    const design = makeDesign({
      inventory: inventory(),
      footprint: row(2),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "sea", numberToken: null },
      ],
    });

    expect(
      rejected(
        apply(design, {
          type: "hex.placed",
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "position-occupied",
      message: "That grid position is occupied.",
    });
  });

  it("requires a border before any tile can be placed", () => {
    expect(
      rejected(
        apply(makeDesign({ inventory: inventory(), footprint: [] }), {
          type: "hex.placed",
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "Create the board border before placing terrain.",
    });
  });

  it("stops once the terrain inventory is exhausted", () => {
    let design = makeDesign({ inventory: inventory(), footprint: row(2) });
    design = accepted(
      apply(design, {
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    );
    expect(remainingInventory(design).terrain.forest).toBe(0);

    expect(
      rejected(
        apply(design, {
          type: "hex.placed",
          coordinate: { q: 1, r: 0 },
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "inventory-exhausted",
      message: "No matching terrain hex remains in the inventory.",
    });
  });

  it("copies the coordinate instead of aliasing the command", () => {
    const coordinate = { q: 1, r: 0 };
    const design = accepted(
      apply(makeDesign({ inventory: inventory(), footprint: row(2) }), {
        type: "hex.placed",
        coordinate,
        terrain: "sea",
      }),
    );

    expect(design.hexes[0]?.coordinate).toEqual({ q: 1, r: 0 });
    expect(design.hexes[0]?.coordinate).not.toBe(coordinate);
    expect(design.hexes[0]?.numberToken).toBeNull();
  });
});

describe("applyBoardCommand — hex.terrainChanged", () => {
  it("rejects an empty cell", () => {
    expect(
      rejected(
        apply(makeDesign({ footprint: row(2) }), {
          type: "hex.terrainChanged",
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "position-empty",
      message: "That grid position is empty.",
    });
  });

  it("is a no-op when the terrain already matches", () => {
    const design = coastalDesign(coastalInventory());
    const result = apply(design, {
      type: "hex.terrainChanged",
      coordinate: { q: 0, r: 0 },
      terrain: "forest",
    });

    expect(result.ok).toBe(true);
    // Returning the same reference matters: it lets callers skip a revision bump.
    expect(accepted(result)).toBe(design);
  });

  it("stops when no replacement terrain remains", () => {
    const design = coastalDesign(
      inventoryWith({ terrain: { forest: 2, sea: 1 }, ports: { generic: 1 } }),
    );

    expect(
      rejected(
        apply(design, {
          type: "hex.terrainChanged",
          coordinate: { q: 1, r: 0 },
          terrain: "forest",
        }),
      ),
    ).toEqual({
      code: "inventory-exhausted",
      message: "No matching terrain hex remains in the inventory.",
    });
  });

  it("drops ports that no longer face sea after the change", () => {
    const design = coastalDesign(coastalInventory());
    expect(design.ports).toHaveLength(1);

    const next = accepted(
      apply(design, {
        type: "hex.terrainChanged",
        coordinate: { q: 1, r: 0 },
        terrain: "forest",
      }),
    );

    expect(next.hexes.map((hex) => hex.terrain)).toEqual([
      "forest",
      "forest",
      "forest",
    ]);
    expect(next.ports).toEqual([]);
    // The source design is untouched.
    expect(design.hexes[1]?.terrain).toBe("sea");
    expect(design.ports).toHaveLength(1);
  });

  it("keeps a number token on producing terrain but clears it otherwise", () => {
    const design = makeDesign({
      inventory: inventoryWith({
        terrain: { forest: 1, gold: 1, desert: 1 },
        numbers: { 6: 1 },
      }),
      footprint: row(1),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: 6 },
      ],
    });

    const toGold = accepted(
      apply(design, {
        type: "hex.terrainChanged",
        coordinate: { q: 0, r: 0 },
        terrain: "gold",
      }),
    );
    expect(toGold.hexes[0]).toMatchObject({ terrain: "gold", numberToken: 6 });

    const toDesert = accepted(
      apply(design, {
        type: "hex.terrainChanged",
        coordinate: { q: 0, r: 0 },
        terrain: "desert",
      }),
    );
    expect(toDesert.hexes[0]).toMatchObject({
      terrain: "desert",
      numberToken: null,
    });
    // Clearing the token returns it to the inventory.
    expect(remainingInventory(toDesert).numbers[6]).toBe(1);
  });
});

describe("applyBoardCommand — hex.removed", () => {
  it("rejects an empty cell", () => {
    expect(
      rejected(
        apply(makeDesign({ footprint: row(2) }), {
          type: "hex.removed",
          coordinate: { q: 5, r: 5 },
        }),
      ),
    ).toEqual({
      code: "position-empty",
      message: "That grid position is empty.",
    });
  });

  it("returns the tile to the inventory and drops orphaned ports", () => {
    const design = coastalDesign(coastalInventory());
    expect(remainingInventory(design).terrain.sea).toBe(0);

    const next = accepted(
      apply(design, { type: "hex.removed", coordinate: { q: 1, r: 0 } }),
    );

    expect(next.hexes.map((hex) => hex.coordinate)).toEqual([
      { q: 0, r: 0 },
      { q: 2, r: 0 },
    ]);
    expect(next.ports).toEqual([]);
    expect(remainingInventory(next).terrain.sea).toBe(1);
    expect(remainingInventory(next).ports.generic).toBe(1);
  });
});

describe("applyBoardCommand — hex.moved", () => {
  const movable = () =>
    makeDesign({
      inventory: inventoryWith({
        terrain: { forest: 1, sea: 1 },
        ports: { generic: 1 },
      }),
      footprint: row(4),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
        { coordinate: { q: 1, r: 0 }, terrain: "sea", numberToken: null },
      ],
      ports: [
        { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
      ],
    });

  it("rejects an invalid destination coordinate", () => {
    expect(
      rejected(
        apply(movable(), {
          type: "hex.moved",
          from: { q: 0, r: 0 },
          to: { q: MAX_BOARD_HEXES + 5, r: 0 },
        }),
      ),
    ).toEqual({
      code: "invalid-layout",
      message: "The target coordinate is invalid.",
    });
  });

  it("rejects moving from an empty cell", () => {
    expect(
      rejected(
        apply(movable(), {
          type: "hex.moved",
          from: { q: 3, r: 0 },
          to: { q: 2, r: 0 },
        }),
      ),
    ).toEqual({
      code: "position-empty",
      message: "The source grid position is empty.",
    });
  });

  it("rejects moving onto an occupied cell", () => {
    expect(
      rejected(
        apply(movable(), {
          type: "hex.moved",
          from: { q: 0, r: 0 },
          to: { q: 1, r: 0 },
        }),
      ),
    ).toEqual({
      code: "position-occupied",
      message: "The target position is occupied.",
    });
  });

  it("requires a border before moving", () => {
    const borderless = { ...movable(), footprint: [] };

    expect(
      rejected(
        apply(borderless, {
          type: "hex.moved",
          from: { q: 0, r: 0 },
          to: { q: 2, r: 0 },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "Create the board border before moving terrain.",
    });
  });

  it("keeps the destination inside the border", () => {
    expect(
      rejected(
        apply(movable(), {
          type: "hex.moved",
          from: { q: 0, r: 0 },
          to: { q: 9, r: 0 },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "Move tiles inside the current board border.",
    });
  });

  it("moves the tile, conserves inventory, and drops invalidated ports", () => {
    const design = movable();
    const next = accepted(
      apply(design, {
        type: "hex.moved",
        from: { q: 1, r: 0 },
        to: { q: 3, r: 0 },
      }),
    );

    expect(next.hexes).toEqual([
      { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
      { coordinate: { q: 3, r: 0 }, terrain: "sea", numberToken: null },
    ]);
    // The port used to face (1,0); nothing sits there any more.
    expect(next.ports).toEqual([]);
    expect(placedInventory(next).terrain).toEqual(
      placedInventory(design).terrain,
    );
    expect(design.hexes[1]?.coordinate).toEqual({ q: 1, r: 0 });
  });
});

describe("applyBoardCommand — numberToken.set", () => {
  const numbered = (
    inventory = inventoryWith({
      terrain: { forest: 2, sea: 1 },
      numbers: { 6: 1, 8: 1 },
    }),
  ) =>
    makeDesign({
      inventory,
      footprint: row(3),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: 6 },
        { coordinate: { q: 1, r: 0 }, terrain: "sea", numberToken: null },
        { coordinate: { q: 2, r: 0 }, terrain: "forest", numberToken: null },
      ],
    });

  it("rejects an empty cell", () => {
    expect(
      rejected(
        apply(numbered(), {
          type: "numberToken.set",
          coordinate: { q: 7, r: 7 },
          value: 5,
        }),
      ),
    ).toEqual({
      code: "position-empty",
      message: "That grid position is empty.",
    });
  });

  it("rejects non-producing terrain", () => {
    expect(
      rejected(
        apply(numbered(), {
          type: "numberToken.set",
          coordinate: { q: 1, r: 0 },
          value: 8,
        }),
      ),
    ).toEqual({
      code: "invalid-number-target",
      message: "Number tokens can only be placed on producing terrain.",
    });
  });

  it("is a no-op when the token is already set to that value", () => {
    const design = numbered();
    expect(
      accepted(
        apply(design, {
          type: "numberToken.set",
          coordinate: { q: 0, r: 0 },
          value: 6,
        }),
      ),
    ).toBe(design);

    // Clearing an already-empty hex is a no-op too.
    expect(
      accepted(
        apply(design, {
          type: "numberToken.set",
          coordinate: { q: 2, r: 0 },
          value: null,
        }),
      ),
    ).toBe(design);
  });

  it("stops when every copy of the token is already on the board", () => {
    expect(
      rejected(
        apply(numbered(), {
          type: "numberToken.set",
          coordinate: { q: 2, r: 0 },
          value: 6,
        }),
      ),
    ).toEqual({
      code: "inventory-exhausted",
      message: "No matching number token remains in the inventory.",
    });
  });

  it("places a token and returns it to the inventory when cleared", () => {
    const design = numbered();
    const placed = accepted(
      apply(design, {
        type: "numberToken.set",
        coordinate: { q: 2, r: 0 },
        value: 8,
      }),
    );
    expect(placed.hexes[2]?.numberToken).toBe(8);
    expect(remainingInventory(placed).numbers[8]).toBe(0);

    const cleared = accepted(
      apply(placed, {
        type: "numberToken.set",
        coordinate: { q: 2, r: 0 },
        value: null,
      }),
    );
    expect(cleared.hexes[2]?.numberToken).toBeNull();
    expect(remainingInventory(cleared).numbers[8]).toBe(1);
    expect(design.hexes[2]?.numberToken).toBeNull();
  });
});

describe("applyBoardCommand — port.set", () => {
  it("removes the port on the targeted edge when the type is null", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, {
        type: "port.set",
        landCoordinate: { q: 0, r: 0 },
        direction: 0,
        portType: null,
      }),
    );

    expect(next.ports).toEqual([]);
    expect(remainingInventory(next).ports.generic).toBe(1);
  });

  it("leaves other edges alone when clearing", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, {
        type: "port.set",
        landCoordinate: { q: 2, r: 0 },
        direction: 3,
        portType: null,
      }),
    );

    expect(next.ports).toEqual(design.ports);
  });

  it("rejects an edge that does not run from land into sea", () => {
    const design = coastalDesign(coastalInventory());
    const expected = {
      code: "invalid-port-target",
      message: "Ports must face a sea hex from an adjacent land hex.",
    };

    // The anchor hex is sea.
    expect(
      rejected(
        apply(design, {
          type: "port.set",
          landCoordinate: { q: 1, r: 0 },
          direction: 0,
          portType: "generic",
        }),
      ),
    ).toEqual(expected);

    // The anchor is land, but the facing cell is land too.
    expect(
      rejected(
        apply(design, {
          type: "port.set",
          landCoordinate: { q: 2, r: 0 },
          direction: 1,
          portType: "generic",
        }),
      ),
    ).toEqual(expected);
  });

  it("stops when the port inventory is used up", () => {
    const design = coastalDesign(coastalInventory());

    // (2,0) faces the same sea hex from the other side, but the single generic
    // port is already on the board.
    expect(
      rejected(
        apply(design, {
          type: "port.set",
          landCoordinate: { q: 2, r: 0 },
          direction: 3,
          portType: "generic",
        }),
      ),
    ).toEqual({
      code: "inventory-exhausted",
      message: "No matching port remains in the inventory.",
    });
  });

  it("replaces the port already sitting on the same edge", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, {
        type: "port.set",
        landCoordinate: { q: 0, r: 0 },
        direction: 0,
        portType: "forest",
      }),
    );

    // The generic port is swapped out, not stacked on top of.
    expect(next.ports).toEqual([
      { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "forest" },
    ]);
    expect(placedInventory(next).ports).toMatchObject({
      generic: 0,
      forest: 1,
    });
  });
});

describe("applyBoardCommand — footprint.replaced", () => {
  const invalidBorder = {
    code: "invalid-footprint",
    message: "The board border must be connected and 180-degree symmetric.",
  };

  it.each([
    ["more cells than the hex ceiling", row(MAX_BOARD_HEXES + 1)],
    ["an out-of-range cell", [{ q: MAX_BOARD_HEXES + 1, r: 0 }]],
    [
      "duplicate cells",
      [
        { q: 0, r: 0 },
        { q: 0, r: 0 },
      ],
    ],
    [
      "an asymmetric border",
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 0, r: 1 },
      ],
    ],
    [
      "a symmetric but disconnected border",
      [
        { q: 0, r: 0 },
        { q: 4, r: 0 },
      ],
    ],
  ])("rejects %s", (_label, coordinates) => {
    expect(
      rejected(
        apply(makeDesign(), { type: "footprint.replaced", coordinates }),
      ),
    ).toEqual(invalidBorder);
  });

  it("accepts an empty border and clears the board", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, { type: "footprint.replaced", coordinates: [] }),
    );

    expect(next.footprint).toEqual([]);
    expect(next.hexes).toEqual([]);
    expect(next.ports).toEqual([]);
  });

  it("keeps only hexes and ports that survive the new border", () => {
    const design = coastalDesign(coastalInventory());
    const coordinates = [{ q: 0, r: 0 }];
    const next = accepted(
      apply(design, { type: "footprint.replaced", coordinates }),
    );

    expect(next.footprint).toEqual([{ q: 0, r: 0 }]);
    expect(next.footprint[0]).not.toBe(coordinates[0]);
    expect(next.hexes).toEqual([design.hexes[0]]);
    // The port's sea neighbour was cropped away with the border.
    expect(next.ports).toEqual([]);
    expect(design.footprint).toHaveLength(3);
  });
});

describe("applyBoardCommand — footprint pair editing", () => {
  it("rejects a coordinate that is not part of any addable mirrored pair", () => {
    expect(
      rejected(
        apply(makeDesign({ footprint: row(3) }), {
          type: "footprint.pairAdded",
          coordinate: { q: 40, r: 40 },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "That mirrored border pair cannot be added.",
    });
  });

  it("adds both halves of a mirrored pair", () => {
    const next = accepted(
      apply(makeDesign({ footprint: row(3) }), {
        type: "footprint.pairAdded",
        coordinate: { q: 3, r: 0 },
      }),
    );

    expect(next.footprint).toHaveLength(5);
    expect(next.footprint).toEqual(
      expect.arrayContaining([
        { q: -1, r: 0 },
        { q: 3, r: 0 },
      ]),
    );
  });

  it("rejects removing the self-mirrored centre cell", () => {
    expect(
      rejected(
        apply(makeDesign({ footprint: row(3) }), {
          type: "footprint.pairRemoved",
          coordinate: { q: 1, r: 0 },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "That mirrored border pair cannot be removed.",
    });
  });

  it("removes both halves and crops the hexes and ports that fall outside", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, {
        type: "footprint.pairRemoved",
        coordinate: { q: 0, r: 0 },
      }),
    );

    expect(next.footprint).toEqual([{ q: 1, r: 0 }]);
    expect(next.hexes).toEqual([design.hexes[1]]);
    expect(next.ports).toEqual([]);
    expect(remainingInventory(next).terrain.forest).toBe(3);
  });
});

describe("applyBoardCommand — layout.replaced", () => {
  const layoutInventory = () =>
    inventoryWith({
      terrain: { forest: 2, sea: 1 },
      ports: { generic: 1 },
    });

  const layoutHexes = (): BoardHex[] => [
    { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
    { coordinate: { q: 1, r: 0 }, terrain: "sea", numberToken: null },
    { coordinate: { q: 2, r: 0 }, terrain: "forest", numberToken: null },
  ];

  it("rejects an asymmetric existing border", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ],
    });

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: { hexes: layoutHexes(), ports: [] },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message:
        "Create a connected 180-degree symmetric border before replacing the layout.",
    });
  });

  it("rejects a layout that outgrows the inventory", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(3),
    });
    const hexes = layoutHexes();
    hexes[1] = {
      coordinate: { q: 1, r: 0 },
      terrain: "forest",
      numberToken: null,
    };

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: { hexes, ports: [] },
        }),
      ),
    ).toEqual({
      code: "invalid-layout",
      message: "The generated layout does not fit the selected inventory.",
    });
  });

  it("rejects a layout whose ports do not face sea", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(3),
    });

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: {
            hexes: layoutHexes(),
            // Direction 3 from (2,0) points at (1,0), which is sea; direction 1
            // points at (3,-1), which holds nothing at all.
            ports: [
              { landCoordinate: { q: 2, r: 0 }, direction: 1, type: "generic" },
            ],
          },
        }),
      ),
    ).toMatchObject({ code: "invalid-layout" });
  });

  it("rejects a layout that steps outside the border", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(3),
    });
    const hexes = layoutHexes();
    hexes[2] = {
      coordinate: { q: 5, r: 0 },
      terrain: "forest",
      numberToken: null,
    };

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: { hexes, ports: [] },
        }),
      ),
    ).toEqual({
      code: "invalid-footprint",
      message: "The generated layout falls outside the current board border.",
    });
  });

  it("rejects a layout that does not fill the border", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(3),
    });

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: { hexes: layoutHexes().slice(0, 2), ports: [] },
        }),
      ),
    ).toMatchObject({ code: "invalid-footprint" });
  });

  it("rejects a border whose size does not match the inventory", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(4),
    });

    expect(
      rejected(
        apply(design, {
          type: "layout.replaced",
          layout: { hexes: layoutHexes(), ports: [] },
        }),
      ),
    ).toMatchObject({ code: "invalid-footprint" });
  });

  it("accepts an empty layout regardless of the border size", () => {
    const design = coastalDesign(coastalInventory());
    const next = accepted(
      apply(design, {
        type: "layout.replaced",
        layout: { hexes: [], ports: [] },
      }),
    );

    expect(next.hexes).toEqual([]);
    expect(next.ports).toEqual([]);
    expect(next.footprint).toEqual(row(3));
  });

  it("accepts a fitting layout and deep-copies its coordinates", () => {
    const design = makeDesign({
      inventory: layoutInventory(),
      footprint: row(3),
    });
    const layout = {
      hexes: layoutHexes(),
      ports: [
        { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
      ],
    } satisfies GeneratedBoardLayout;

    const next = accepted(apply(design, { type: "layout.replaced", layout }));

    expect(next.hexes).toEqual(layout.hexes);
    expect(next.hexes[0]?.coordinate).not.toBe(layout.hexes[0]?.coordinate);
    expect(next.ports).toEqual(layout.ports);
    expect(next.ports[0]?.landCoordinate).not.toBe(
      layout.ports[0]?.landCoordinate,
    );
    expect(placedInventory(next).terrain).toMatchObject({
      forest: 2,
      sea: 1,
    });
  });
});

describe("validateBoardDesign — structural errors", () => {
  it("flags fractional coordinates", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { forest: 1 } }),
      hexes: [
        { coordinate: { q: 0.5, r: 0 }, terrain: "forest", numberToken: null },
      ],
    });

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "invalid-coordinate",
        severity: "error",
        coordinates: [{ q: 0.5, r: 0 }],
      }),
    );
  });

  it("flags number tokens on non-producing terrain", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { desert: 1 }, numbers: { 6: 1 } }),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "desert", numberToken: 6 },
      ],
    });

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "invalid-number-token",
        severity: "error",
      }),
    );
  });

  it("flags two hexes stacked on the same coordinate", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { forest: 2 } }),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
      ],
    });

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "duplicate-coordinate",
        severity: "error",
        coordinates: [
          { q: 0, r: 0 },
          { q: 0, r: 0 },
        ],
      }),
    );
  });

  it("flags a border split into separate groups", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { sea: 2 } }),
      footprint: [
        { q: 0, r: 0 },
        { q: 4, r: 0 },
      ],
    });

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "disconnected-board",
        severity: "error",
        message: "The board border contains disconnected groups of cells.",
      }),
    );
  });

  it("flags disconnected hexes when there is no border at all", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { forest: 2 } }),
      footprint: [],
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
        { coordinate: { q: 4, r: 0 }, terrain: "forest", numberToken: null },
      ],
    });
    const issues = validateBoardDesign(design);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "disconnected-board",
        message: "The board contains disconnected groups of hexes.",
      }),
    );
    // Two one-tile islands: the message must use the plural form.
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "small-island",
        message: "2 land islands have fewer than three tiles.",
      }),
    );
  });

  it("warns about an asymmetric border without calling it an error", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { sea: 3 } }),
      footprint: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 0, r: 1 },
      ],
    });
    const issues = validateBoardDesign(design);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "asymmetric-footprint",
        severity: "warning",
      }),
    );
    expect(issues).not.toContainEqual(
      expect.objectContaining({ code: "disconnected-board" }),
    );
  });

  it("flags a layout that uses more pieces than the inventory allows", () => {
    const design = makeDesign({
      inventory: inventoryWith({ terrain: { forest: 1 } }),
      footprint: row(2),
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
        { coordinate: { q: 1, r: 0 }, terrain: "forest", numberToken: null },
      ],
    });

    expect(validateBoardDesign(design)).toContainEqual(
      expect.objectContaining({
        code: "inventory-exceeded",
        severity: "error",
      }),
    );
  });

  it("flags ports that face land and ports stacked on one edge", () => {
    const hexes: BoardHex[] = [
      { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
      { coordinate: { q: 1, r: 0 }, terrain: "forest", numberToken: null },
      { coordinate: { q: 2, r: 0 }, terrain: "sea", numberToken: null },
    ];
    const facingLand = makeDesign({
      inventory: inventoryWith({
        terrain: { forest: 2, sea: 1 },
        ports: { generic: 2 },
      }),
      footprint: row(3),
      hexes,
      ports: [
        { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
      ],
    });

    expect(validateBoardDesign(facingLand)).toContainEqual(
      expect.objectContaining({
        code: "invalid-port",
        severity: "error",
        coordinates: [{ q: 0, r: 0 }],
      }),
    );

    const duplicated = {
      ...facingLand,
      ports: [
        { landCoordinate: { q: 1, r: 0 }, direction: 0, type: "generic" },
        { landCoordinate: { q: 1, r: 0 }, direction: 0, type: "generic" },
      ] satisfies BoardPort[],
    };

    // Both ports are individually legal, so only the duplicate edge is at fault.
    expect(validateBoardDesign(duplicated)).toContainEqual(
      expect.objectContaining({ code: "invalid-port", coordinates: [] }),
    );
  });
});

describe("board inventory accounting", () => {
  it("counts only producing terrain", () => {
    const classic = createClassicIslandInventory();
    expect(producingTerrainCount(classic)).toBe(27);
    expect(producingTerrainCount(createEmptyBoardInventory())).toBe(0);
    expect(
      producingTerrainCount(
        inventoryWith({ terrain: { desert: 4, sea: 9, gold: 2 } }),
      ),
    ).toBe(2);
  });

  it("rejects layouts with duplicate hex coordinates or duplicate port edges", () => {
    const inventory = inventoryWith({
      terrain: { forest: 4, sea: 4 },
      ports: { generic: 4 },
    });

    expect(
      inventoryFitsDesign(inventory, {
        hexes: [
          { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
          { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
        ],
        ports: [],
      }),
    ).toBe(false);

    expect(
      inventoryFitsDesign(inventory, {
        hexes: [
          { coordinate: { q: 0, r: 0 }, terrain: "forest", numberToken: null },
          { coordinate: { q: 1, r: 0 }, terrain: "sea", numberToken: null },
        ],
        ports: [
          { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
          { landCoordinate: { q: 0, r: 0 }, direction: 0, type: "generic" },
        ],
      }),
    ).toBe(false);
  });

  it("returns fresh inventories from every setter", () => {
    const base = inventoryWith({
      terrain: { forest: 1 },
      numbers: { 6: 1 },
      ports: { generic: 1 },
    });
    const snapshot = cloneInventory(base);

    const terrain = setTerrainCount(base, "forest", 5);
    const numbers = setNumberCount(base, 6, 5);
    const ports = setPortCount(base, "generic", 5);

    expect(terrain.terrain.forest).toBe(5);
    expect(numbers.numbers[6]).toBe(5);
    expect(ports.ports.generic).toBe(5);

    // None of the setters touch the other categories or the source inventory.
    expect(numbers.terrain).toEqual(snapshot.terrain);
    expect(numbers.ports).toEqual(snapshot.ports);
    expect(ports.terrain).toEqual(snapshot.terrain);
    expect(ports.numbers).toEqual(snapshot.numbers);
    expect(base).toEqual(snapshot);
  });

  it("conserves pieces across a place/remove round trip", () => {
    const inventory = inventoryWith({
      terrain: { forest: 2, sea: 1 },
      numbers: { 6: 1 },
      ports: { generic: 1 },
    });
    const start = makeDesign({ inventory, footprint: row(3) });
    const before = remainingInventory(start);

    let design = start;
    for (const [index, terrain] of (
      ["forest", "sea", "forest"] as const
    ).entries()) {
      design = accepted(
        apply(design, {
          type: "hex.placed",
          coordinate: { q: index, r: 0 },
          terrain,
        }),
      );
    }
    design = accepted(
      apply(design, {
        type: "numberToken.set",
        coordinate: { q: 0, r: 0 },
        value: 6,
      }),
    );
    design = accepted(
      apply(design, {
        type: "port.set",
        landCoordinate: { q: 0, r: 0 },
        direction: 0,
        portType: "generic",
      }),
    );

    const empty = createEmptyBoardInventory();
    expect(remainingInventory(design)).toEqual(empty);
    expect(placedInventory(design)).toEqual(inventory);

    // Removing every hex hands back the tiles, the token, and the port.
    for (const index of [0, 1, 2]) {
      design = accepted(
        apply(design, {
          type: "hex.removed",
          coordinate: { q: index, r: 0 },
        }),
      );
    }

    expect(design.hexes).toEqual([]);
    expect(design.ports).toEqual([]);
    expect(remainingInventory(design)).toEqual(before);
    expect(placedInventory(design)).toEqual(empty);
  });
});
