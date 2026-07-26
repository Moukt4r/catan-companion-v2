import { coordinateKey, edgeKey } from "./coordinates";
import {
  MAX_BOARD_HEXES,
  NUMBER_TOKEN_VALUES,
  PORT_TYPES,
  PRODUCING_TERRAINS,
  TERRAIN_TYPES,
  type BoardDesign,
  type BoardInventory,
  type NumberTokenCounts,
  type NumberTokenValue,
  type PortType,
  type ProducingTerrain,
  type TerrainType,
} from "./types";

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  forest: "Forest",
  pasture: "Pasture",
  fields: "Fields",
  hills: "Hills",
  mountains: "Mountains",
  gold: "Gold Field",
  desert: "Desert",
  sea: "Sea",
};

export const PORT_LABELS: Record<PortType, string> = {
  generic: "Generic 3:1",
  forest: "Forest 2:1",
  pasture: "Pasture 2:1",
  fields: "Fields 2:1",
  hills: "Hills 2:1",
  mountains: "Mountains 2:1",
};

export function createEmptyBoardInventory(): BoardInventory {
  return {
    terrain: {
      forest: 0,
      pasture: 0,
      fields: 0,
      hills: 0,
      mountains: 0,
      gold: 0,
      desert: 0,
      sea: 0,
    },
    numbers: {
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      12: 0,
    },
    ports: {
      generic: 0,
      forest: 0,
      pasture: 0,
      fields: 0,
      hills: 0,
      mountains: 0,
    },
  };
}

/**
 * The number tokens in the table's physical set.
 *
 * Deliberately a literal rather than a formula: this is what the box actually
 * contains, confirmed by counting the tokens themselves. Most values mirror
 * their partner around seven — 2 with 12, 3 with 11, 4 with 10, 5 with 9 —
 * but 6 and 8 do not, so an even distribution cannot reproduce it.
 */
export const CLASSIC_NUMBER_TOKEN_COUNTS: NumberTokenCounts = {
  2: 2,
  3: 3,
  4: 3,
  5: 3,
  6: 2,
  8: 3,
  9: 3,
  10: 3,
  11: 3,
  12: 2,
};

export function createClassicIslandInventory(): BoardInventory {
  // Counted from the table's own board: twenty-seven land tiles, matching the
  // twenty-seven number tokens, and twelve sea tiles. Thirty-nine positions in
  // all, which the symmetric border lays out as rows of 5-5-6-7-6-5-5.
  const terrain = {
    forest: 5,
    pasture: 5,
    fields: 5,
    hills: 5,
    mountains: 5,
    gold: 2,
    desert: 0,
    sea: 12,
  };
  return {
    terrain,
    numbers: { ...CLASSIC_NUMBER_TOKEN_COUNTS },
    ports: {
      generic: 4,
      forest: 1,
      pasture: 1,
      fields: 1,
      hills: 1,
      mountains: 1,
    },
  };
}

export function producingTerrainCount(inventory: BoardInventory): number {
  return PRODUCING_TERRAINS.reduce(
    (total, terrain) => total + inventory.terrain[terrain],
    0,
  );
}

export function cloneInventory(inventory: BoardInventory): BoardInventory {
  return {
    terrain: { ...inventory.terrain },
    numbers: { ...inventory.numbers },
    ports: { ...inventory.ports },
  };
}

export function isProducingTerrain(
  terrain: TerrainType,
): terrain is ProducingTerrain {
  return (PRODUCING_TERRAINS as readonly TerrainType[]).includes(terrain);
}

export function totalTerrain(inventory: BoardInventory): number {
  return TERRAIN_TYPES.reduce(
    (total, terrain) => total + inventory.terrain[terrain],
    0,
  );
}

export function totalNumbers(inventory: BoardInventory): number {
  return NUMBER_TOKEN_VALUES.reduce(
    (total, value) => total + inventory.numbers[value],
    0,
  );
}

export function totalPorts(inventory: BoardInventory): number {
  return PORT_TYPES.reduce((total, port) => total + inventory.ports[port], 0);
}

export function placedInventory(design: BoardDesign): BoardInventory {
  const placed = createEmptyBoardInventory();
  for (const hex of design.hexes) {
    placed.terrain[hex.terrain] += 1;
    if (hex.numberToken !== null) {
      placed.numbers[hex.numberToken] += 1;
    }
  }
  for (const port of design.ports) {
    placed.ports[port.type] += 1;
  }
  return placed;
}

export function remainingInventory(design: BoardDesign): BoardInventory {
  const placed = placedInventory(design);
  const remaining = createEmptyBoardInventory();
  for (const terrain of TERRAIN_TYPES) {
    remaining.terrain[terrain] =
      design.inventory.terrain[terrain] - placed.terrain[terrain];
  }
  for (const value of NUMBER_TOKEN_VALUES) {
    remaining.numbers[value] =
      design.inventory.numbers[value] - placed.numbers[value];
  }
  for (const port of PORT_TYPES) {
    remaining.ports[port] = design.inventory.ports[port] - placed.ports[port];
  }
  return remaining;
}

export function inventoryFitsDesign(
  inventory: BoardInventory,
  design: Pick<BoardDesign, "hexes" | "ports">,
): boolean {
  const terrain = createEmptyBoardInventory().terrain;
  const numbers = createEmptyBoardInventory().numbers;
  const ports = createEmptyBoardInventory().ports;
  const coordinates = new Set<string>();
  const edges = new Set<string>();

  for (const hex of design.hexes) {
    const key = coordinateKey(hex.coordinate);
    if (coordinates.has(key)) {
      return false;
    }
    coordinates.add(key);
    terrain[hex.terrain] += 1;
    if (hex.numberToken !== null) {
      numbers[hex.numberToken] += 1;
    }
  }

  for (const port of design.ports) {
    const key = edgeKey(port.landCoordinate, port.direction);
    if (edges.has(key)) {
      return false;
    }
    edges.add(key);
    ports[port.type] += 1;
  }

  return (
    design.hexes.length <= MAX_BOARD_HEXES &&
    TERRAIN_TYPES.every((item) => terrain[item] <= inventory.terrain[item]) &&
    NUMBER_TOKEN_VALUES.every(
      (item) => numbers[item] <= inventory.numbers[item],
    ) &&
    PORT_TYPES.every((item) => ports[item] <= inventory.ports[item])
  );
}

export function setTerrainCount(
  inventory: BoardInventory,
  item: TerrainType,
  count: number,
): BoardInventory {
  return {
    ...cloneInventory(inventory),
    terrain: { ...inventory.terrain, [item]: count },
  };
}

export function setNumberCount(
  inventory: BoardInventory,
  item: NumberTokenValue,
  count: number,
): BoardInventory {
  return {
    ...cloneInventory(inventory),
    numbers: { ...inventory.numbers, [item]: count },
  };
}

export function setPortCount(
  inventory: BoardInventory,
  item: PortType,
  count: number,
): BoardInventory {
  return {
    ...cloneInventory(inventory),
    ports: { ...inventory.ports, [item]: count },
  };
}
