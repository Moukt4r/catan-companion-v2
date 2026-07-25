import { describe, expect, it } from "vitest";
import {
  APPLICATION_VERSION,
  BOARD_DESIGN_EXPORT_FORMAT,
  BOARD_DESIGN_EXPORT_VERSION,
  type BoardDesignExportDocument,
} from "../../application";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createClassicIslandInventory,
  isConnected,
  isSymmetricFootprint,
  totalTerrain,
  type BoardDesign,
} from "../../domain";
import {
  parseBoardDesign,
  parseBoardDesignExportDocument,
} from "./boardDesignSchemas";

describe("board design persistence schemas", () => {
  it("roundtrips valid designs and exports", () => {
    const design = fixture();
    const document: BoardDesignExportDocument = {
      format: BOARD_DESIGN_EXPORT_FORMAT,
      exportVersion: BOARD_DESIGN_EXPORT_VERSION,
      exportedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      applicationVersion: APPLICATION_VERSION,
      design,
    };

    expect(parseBoardDesign(design)).toEqual(design);
    expect(parseBoardDesignExportDocument(document)).toEqual(document);
  });

  it("rejects duplicate coordinates and inconsistent inventory", () => {
    const duplicate = fixture();
    duplicate.inventory.terrain.forest = 2;
    duplicate.hexes = [
      {
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
        numberToken: null,
      },
      {
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
        numberToken: null,
      },
    ];
    expect(() => parseBoardDesign(duplicate)).toThrow(
      "Board design contents are inconsistent.",
    );

    const exceeded = fixture();
    exceeded.inventory.terrain.forest = 0;
    exceeded.hexes = [
      {
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
        numberToken: null,
      },
    ];
    expect(() => parseBoardDesign(exceeded)).toThrow(
      "Board design contents are inconsistent.",
    );
  });

  it("rejects unsupported export versions explicitly", () => {
    expect(() =>
      parseBoardDesignExportDocument({
        format: BOARD_DESIGN_EXPORT_FORMAT,
        exportVersion: 99,
      }),
    ).toThrow("not supported");
  });

  it("rejects aggregate terrain inventories above the board limit", () => {
    const design = fixture();
    for (const terrain of Object.keys(design.inventory.terrain) as Array<
      keyof typeof design.inventory.terrain
    >) {
      design.inventory.terrain[terrain] = 127;
    }

    expect(() => parseBoardDesign(design)).toThrow(
      "Board design contents are inconsistent.",
    );
  });

  it("migrates version 1 designs with no Gold Field inventory", () => {
    const current = fixture();
    const legacy = {
      documentVersion: 1,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          forest: current.inventory.terrain.forest,
          pasture: current.inventory.terrain.pasture,
          fields: current.inventory.terrain.fields,
          hills: current.inventory.terrain.hills,
          mountains: current.inventory.terrain.mountains,
          desert: current.inventory.terrain.desert,
          sea: current.inventory.terrain.sea,
        },
      },
      hexes: current.hexes,
      ports: current.ports,
    };

    const migrated = parseBoardDesign(legacy);
    expect(migrated).toMatchObject({
      documentVersion: BOARD_DOCUMENT_VERSION,
      inventory: { terrain: { gold: 0 } },
    });
    expect(migrated.inventory.terrain.sea).toBe(current.inventory.terrain.sea);
    expect(migrated.footprint).toHaveLength(totalTerrain(migrated.inventory));
  });

  it("migrates version 2 designs by deriving their footprint", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: current.inventory,
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
          numberToken: 5,
        },
      ],
      ports: current.ports,
    };

    const migrated = parseBoardDesign(versionTwo);
    expect(migrated).toMatchObject({
      documentVersion: BOARD_DOCUMENT_VERSION,
    });
    expect(migrated.footprint).toHaveLength(totalTerrain(migrated.inventory));
    expect(migrated.footprint).toContainEqual({ q: 0, r: 0 });
  });

  it("migrates empty maximum-size designs without adding sea", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          forest: 127,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 0,
        },
      },
      hexes: [],
      ports: [],
    };

    const migrated = parseBoardDesign(versionTwo);

    expect(migrated.footprint).toHaveLength(127);
    expect(migrated.inventory.terrain.sea).toBe(0);
  });

  it("migrates asymmetric legacy layouts into a containing symmetric border", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          ...current.inventory.terrain,
          forest: 2,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 0,
        },
      },
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
          numberToken: 5,
        },
        {
          coordinate: { q: 1, r: -1 },
          terrain: "forest",
          numberToken: 9,
        },
      ],
      ports: [],
    };

    const migrated = parseBoardDesign(versionTwo);

    expect(isSymmetricFootprint(migrated.footprint)).toBe(true);
    expect(
      isConnected(
        migrated.footprint.map((coordinate) => ({
          coordinate,
          terrain: "sea",
          numberToken: null,
        })),
      ),
    ).toBe(true);
    expect(migrated.footprint).toEqual(
      expect.arrayContaining(migrated.hexes.map((hex) => hex.coordinate)),
    );
    expect(migrated.footprint).toHaveLength(totalTerrain(migrated.inventory));
  });

  it("adds sea capacity when legacy containment needs another cell", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          ...current.inventory.terrain,
          forest: 4,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 0,
        },
      },
      hexes: [
        {
          coordinate: { q: 2, r: -2 },
          terrain: "forest",
          numberToken: 5,
        },
        {
          coordinate: { q: 1, r: 2 },
          terrain: "forest",
          numberToken: 6,
        },
        {
          coordinate: { q: -1, r: 2 },
          terrain: "forest",
          numberToken: 8,
        },
        {
          coordinate: { q: 0, r: 0 },
          terrain: "forest",
          numberToken: 9,
        },
      ],
      ports: [],
    };

    const migrated = parseBoardDesign(versionTwo);

    expect(migrated.footprint).toHaveLength(totalTerrain(migrated.inventory));
    expect(migrated.inventory.terrain.sea).toBeGreaterThan(0);
  });

  it.each([3, 127])(
    "uses a matching-parity legacy border for %i inventory tiles",
    (inventoryCount) => {
      const current = fixture();
      const versionTwo = {
        documentVersion: 2,
        id: current.id,
        revision: current.revision,
        name: current.name,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
        inventory: {
          ...current.inventory,
          terrain: {
            forest: inventoryCount,
            pasture: 0,
            fields: 0,
            hills: 0,
            mountains: 0,
            gold: 0,
            desert: 0,
            sea: 0,
          },
        },
        hexes: [
          {
            coordinate: { q: 0, r: 0 },
            terrain: "forest",
            numberToken: 5,
          },
          {
            coordinate: { q: 1, r: 0 },
            terrain: "forest",
            numberToken: 9,
          },
        ],
        ports: [],
      };

      const migrated = parseBoardDesign(versionTwo);

      expect(migrated.footprint).toHaveLength(inventoryCount);
      expect(migrated.inventory.terrain.sea).toBe(0);
    },
  );

  it("keeps seven-tile legacy inventory when the standard border contains it", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          forest: 7,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 0,
        },
      },
      hexes: [
        {
          coordinate: { q: 1, r: -1 },
          terrain: "forest",
          numberToken: 5,
        },
        {
          coordinate: { q: -1, r: 0 },
          terrain: "forest",
          numberToken: 6,
        },
        {
          coordinate: { q: 0, r: 1 },
          terrain: "forest",
          numberToken: 9,
        },
      ],
      ports: [],
    };

    const migrated = parseBoardDesign(versionTwo);

    expect(migrated.footprint).toHaveLength(7);
    expect(migrated.inventory.terrain.sea).toBe(0);
  });

  it("keeps five-tile inventory for noncanonical exact legacy borders", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          forest: 5,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 0,
        },
      },
      hexes: [
        {
          coordinate: { q: 2, r: -1 },
          terrain: "forest",
          numberToken: 5,
        },
        {
          coordinate: { q: -1, r: 2 },
          terrain: "forest",
          numberToken: 9,
        },
      ],
      ports: [],
    };

    const migrated = parseBoardDesign(versionTwo);

    expect(migrated.footprint).toHaveLength(5);
    expect(migrated.inventory.terrain.sea).toBe(0);
  });

  it("recenters distant legacy layouts and shifts their ports", () => {
    const current = fixture();
    const versionTwo = {
      documentVersion: 2,
      id: current.id,
      revision: current.revision,
      name: current.name,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
      inventory: {
        ...current.inventory,
        terrain: {
          ...current.inventory.terrain,
          forest: 1,
          pasture: 0,
          fields: 0,
          hills: 0,
          mountains: 0,
          gold: 0,
          desert: 0,
          sea: 1,
        },
        ports: {
          ...current.inventory.ports,
          generic: 1,
        },
      },
      hexes: [
        {
          coordinate: { q: 64, r: 0 },
          terrain: "forest",
          numberToken: 5,
        },
        {
          coordinate: { q: 65, r: 0 },
          terrain: "sea",
          numberToken: null,
        },
      ],
      ports: [
        {
          landCoordinate: { q: 64, r: 0 },
          direction: 0,
          type: "generic",
        },
      ],
    };

    expect(parseBoardDesign(versionTwo)).toMatchObject({
      footprint: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      hexes: [
        { coordinate: { q: 0, r: 0 }, terrain: "forest" },
        { coordinate: { q: 1, r: 0 }, terrain: "sea" },
      ],
      ports: [{ landCoordinate: { q: 0, r: 0 } }],
    });
  });

  it("rejects asymmetric version 3 footprints", () => {
    const design = fixture();
    design.footprint = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ];

    expect(() => parseBoardDesign(design)).toThrow(
      "Board design contents are inconsistent.",
    );
  });
});

function fixture(): BoardDesign {
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("schema-board"),
    revision: 0,
    name: "Schema island",
    createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    inventory: createClassicIslandInventory(),
    footprint: [],
    hexes: [],
    ports: [],
  };
}
