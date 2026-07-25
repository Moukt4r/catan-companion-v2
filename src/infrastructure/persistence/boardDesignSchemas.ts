import { z } from "zod";
import {
  BOARD_DESIGN_EXPORT_FORMAT,
  BOARD_DESIGN_EXPORT_VERSION,
  type BoardDesignExportDocument,
} from "../../application/boardDesigns";
import { persistenceError } from "../../application/errors";
import {
  BOARD_DOCUMENT_VERSION,
  MAX_BOARD_HEXES,
  appendPair,
  createSymmetricContainingFootprint,
  createSymmetricFootprint,
  coordinateKey,
  edgeKey,
  inventoryFitsDesign,
  isConnected,
  isProducingTerrain,
  isSymmetricFootprint,
  isValidPortPlacement,
  symmetricExpansionPairs,
  totalTerrain,
  type BoardDesign,
  type BoardHex,
  type BoardInventory,
  type BoardPort,
  type HexDirection,
} from "../../domain";

const id = z.string().min(1).max(256);
const isoTimestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0).max(MAX_BOARD_HEXES);
const coordinateSchema = z.strictObject({
  q: z.number().int().min(-MAX_BOARD_HEXES).max(MAX_BOARD_HEXES),
  r: z.number().int().min(-MAX_BOARD_HEXES).max(MAX_BOARD_HEXES),
});
const terrainSchema = z.enum([
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "gold",
  "desert",
  "sea",
]);
const legacyTerrainSchema = z.enum([
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "desert",
  "sea",
]);
const numberTokenSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(8),
  z.literal(9),
  z.literal(10),
  z.literal(11),
  z.literal(12),
]);
const portTypeSchema = z.enum([
  "generic",
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
]);

const inventorySchema = z.strictObject({
  terrain: z.strictObject({
    forest: count,
    pasture: count,
    fields: count,
    hills: count,
    mountains: count,
    gold: count,
    desert: count,
    sea: count,
  }),
  numbers: z.strictObject({
    2: count,
    3: count,
    4: count,
    5: count,
    6: count,
    8: count,
    9: count,
    10: count,
    11: count,
    12: count,
  }),
  ports: z.strictObject({
    generic: count,
    forest: count,
    pasture: count,
    fields: count,
    hills: count,
    mountains: count,
  }),
});

const legacyInventorySchema = z.strictObject({
  terrain: z.strictObject({
    forest: count,
    pasture: count,
    fields: count,
    hills: count,
    mountains: count,
    desert: count,
    sea: count,
  }),
  numbers: inventorySchema.shape.numbers,
  ports: inventorySchema.shape.ports,
});

const boardHexSchema = z.strictObject({
  coordinate: coordinateSchema,
  terrain: terrainSchema,
  numberToken: numberTokenSchema.nullable(),
});

const legacyBoardHexSchema = z.strictObject({
  coordinate: coordinateSchema,
  terrain: legacyTerrainSchema,
  numberToken: numberTokenSchema.nullable(),
});

const boardPortSchema = z.strictObject({
  landCoordinate: coordinateSchema,
  direction: z.number().int().min(0).max(5),
  type: portTypeSchema,
});

export const boardDesignSchema = z.strictObject({
  documentVersion: z.literal(BOARD_DOCUMENT_VERSION),
  id,
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(80),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  inventory: inventorySchema,
  footprint: z.array(coordinateSchema).max(MAX_BOARD_HEXES),
  hexes: z.array(boardHexSchema).max(MAX_BOARD_HEXES),
  ports: z.array(boardPortSchema).max(MAX_BOARD_HEXES * 6),
});

const versionTwoBoardDesignSchema = z.strictObject({
  documentVersion: z.literal(2),
  id,
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(80),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  inventory: inventorySchema,
  hexes: z.array(boardHexSchema).max(MAX_BOARD_HEXES),
  ports: z.array(boardPortSchema).max(MAX_BOARD_HEXES * 6),
});

const legacyBoardDesignSchema = z.strictObject({
  documentVersion: z.literal(1),
  id,
  revision: z.number().int().min(0),
  name: z.string().trim().min(1).max(80),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  inventory: legacyInventorySchema,
  hexes: z.array(legacyBoardHexSchema).max(MAX_BOARD_HEXES),
  ports: z.array(boardPortSchema).max(MAX_BOARD_HEXES * 6),
});

export const boardDesignExportSchema = z.strictObject({
  format: z.literal(BOARD_DESIGN_EXPORT_FORMAT),
  exportVersion: z.literal(BOARD_DESIGN_EXPORT_VERSION),
  exportedAt: isoTimestamp,
  applicationVersion: z.string().min(1).max(100),
  design: z.unknown(),
});

export function parseBoardDesign(input: unknown): BoardDesign {
  const result = boardDesignSchema.safeParse(input);
  let design: BoardDesign;
  if (result.success) {
    design = result.data as BoardDesign;
  } else {
    const versionTwoResult = versionTwoBoardDesignSchema.safeParse(input);
    if (versionTwoResult.success) {
      const geometry = recenterLegacyGeometry(
        versionTwoResult.data.hexes,
        versionTwoResult.data.ports,
      );
      const migration = migrateLegacyFootprint(
        geometry.hexes,
        versionTwoResult.data.inventory,
      );
      design = {
        ...versionTwoResult.data,
        documentVersion: BOARD_DOCUMENT_VERSION,
        inventory: migration.inventory,
        hexes: geometry.hexes,
        ports: geometry.ports,
        footprint: migration.footprint,
      } as BoardDesign;
    } else {
      const legacyResult = legacyBoardDesignSchema.safeParse(input);
      if (!legacyResult.success) {
        throw persistenceError(
          "INVALID_BOARD_DESIGN",
          "Board design structure is invalid.",
          {
            issueCount:
              result.error.issues.length +
              versionTwoResult.error.issues.length +
              legacyResult.error.issues.length,
          },
          result.error,
        );
      }
      const geometry = recenterLegacyGeometry(
        legacyResult.data.hexes,
        legacyResult.data.ports,
      );
      const legacyInventory: BoardInventory = {
        ...legacyResult.data.inventory,
        terrain: {
          ...legacyResult.data.inventory.terrain,
          gold: 0,
        },
      };
      const migration = migrateLegacyFootprint(geometry.hexes, legacyInventory);
      design = {
        ...legacyResult.data,
        documentVersion: BOARD_DOCUMENT_VERSION,
        inventory: migration.inventory,
        hexes: geometry.hexes,
        ports: geometry.ports,
        footprint: migration.footprint,
      } as BoardDesign;
    }
  }
  const footprintKeys = new Set(design.footprint.map(coordinateKey));
  const coordinateKeys = new Set(
    design.hexes.map((hex) => coordinateKey(hex.coordinate)),
  );
  const edgeKeys = new Set(
    design.ports.map((port) => edgeKey(port.landCoordinate, port.direction)),
  );
  const producingNumbersValid = design.hexes.every(
    (hex) => hex.numberToken === null || isProducingTerrain(hex.terrain),
  );
  const portsValid = design.ports.every((port) =>
    isValidPortPlacement(port, design.hexes),
  );
  const footprintConnected =
    design.footprint.length === 0 ||
    isConnected(
      design.footprint.map((coordinate) => ({
        coordinate,
        terrain: "sea",
        numberToken: null,
      })),
    );
  if (
    design.footprint.length > MAX_BOARD_HEXES ||
    footprintKeys.size !== design.footprint.length ||
    !isSymmetricFootprint(design.footprint) ||
    !footprintConnected ||
    coordinateKeys.size !== design.hexes.length ||
    design.hexes.some(
      (hex) => !footprintKeys.has(coordinateKey(hex.coordinate)),
    ) ||
    edgeKeys.size !== design.ports.length ||
    !producingNumbersValid ||
    !portsValid ||
    totalTerrain(design.inventory) > MAX_BOARD_HEXES ||
    !inventoryFitsDesign(design.inventory, design)
  ) {
    throw persistenceError(
      "INVALID_BOARD_DESIGN",
      "Board design contents are inconsistent.",
    );
  }
  return design;
}

function recenterLegacyGeometry(
  hexes: readonly BoardHex[],
  ports: ReadonlyArray<Omit<BoardPort, "direction"> & { direction: number }>,
): { hexes: BoardHex[]; ports: BoardPort[] } {
  if (hexes.length === 0) {
    return {
      hexes: [],
      ports: ports.map((port) => ({
        ...port,
        direction: toHexDirection(port.direction),
        landCoordinate: { ...port.landCoordinate },
      })),
    };
  }

  const qValues = hexes.map((hex) => hex.coordinate.q);
  const rValues = hexes.map((hex) => hex.coordinate.r);
  const shift = {
    q: Math.floor((Math.min(...qValues) + Math.max(...qValues)) / 2),
    r: Math.floor((Math.min(...rValues) + Math.max(...rValues)) / 2),
  };
  const translate = (coordinate: { q: number; r: number }) => ({
    q: coordinate.q - shift.q,
    r: coordinate.r - shift.r,
  });
  return {
    hexes: hexes.map((hex) => ({
      ...hex,
      coordinate: translate(hex.coordinate),
    })),
    ports: ports.map((port) => ({
      ...port,
      direction: toHexDirection(port.direction),
      landCoordinate: translate(port.landCoordinate),
    })),
  };
}

function migrateLegacyFootprint(
  hexes: readonly BoardHex[],
  inventory: BoardInventory,
): { footprint: BoardDesign["footprint"]; inventory: BoardInventory } {
  const inventoryCount = totalTerrain(inventory);
  if (hexes.length === 0) {
    const generated = createSymmetricFootprint(inventoryCount);
    return {
      footprint: generated.ok ? generated.value : [],
      inventory: {
        terrain: { ...inventory.terrain },
        numbers: { ...inventory.numbers },
        ports: { ...inventory.ports },
      },
    };
  }
  let footprint = createSymmetricContainingFootprint(
    hexes.map((hex) => hex.coordinate),
    inventoryCount,
  );
  let targetCount = Math.max(inventoryCount, footprint.length);
  if ((targetCount - footprint.length) % 2 !== 0) {
    targetCount += 1;
  }
  while (footprint.length < targetCount) {
    const pair = symmetricExpansionPairs(footprint)[0];
    if (!pair) {
      break;
    }
    footprint = appendPair(footprint, pair);
  }
  const addedSea = Math.max(0, footprint.length - inventoryCount);
  return {
    footprint,
    inventory: {
      terrain: {
        ...inventory.terrain,
        sea: inventory.terrain.sea + addedSea,
      },
      numbers: { ...inventory.numbers },
      ports: { ...inventory.ports },
    },
  };
}

function toHexDirection(value: number): HexDirection {
  switch (value) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return value;
    default:
      throw persistenceError(
        "INVALID_BOARD_DESIGN",
        "A legacy board port has an invalid direction.",
      );
  }
}

export function parseBoardDesignExportDocument(
  input: unknown,
): BoardDesignExportDocument {
  if (
    typeof input === "object" &&
    input !== null &&
    "format" in input &&
    input.format === BOARD_DESIGN_EXPORT_FORMAT &&
    "exportVersion" in input &&
    input.exportVersion !== BOARD_DESIGN_EXPORT_VERSION
  ) {
    throw persistenceError(
      "UNSUPPORTED_VERSION",
      "This board-design export version is not supported.",
    );
  }
  const result = boardDesignExportSchema.safeParse(input);
  if (!result.success) {
    throw persistenceError(
      "INVALID_BOARD_DESIGN",
      "The selected file is not a valid board-design export.",
      { issueCount: result.error.issues.length },
      result.error,
    );
  }
  return {
    ...result.data,
    design: parseBoardDesign(result.data.design),
  } as BoardDesignExportDocument;
}
