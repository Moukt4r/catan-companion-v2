import type { BoardDesignId, IsoTimestamp } from "../types";

export const BOARD_DOCUMENT_VERSION = 3;
export const MAX_BOARD_HEXES = 127;

export const TERRAIN_TYPES = [
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "gold",
  "desert",
  "sea",
] as const;

export type TerrainType = (typeof TERRAIN_TYPES)[number];

export const PRODUCING_TERRAINS = [
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "gold",
] as const satisfies readonly TerrainType[];

export type ProducingTerrain = (typeof PRODUCING_TERRAINS)[number];

export const NUMBER_TOKEN_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;

export type NumberTokenValue = (typeof NUMBER_TOKEN_VALUES)[number];

export const PORT_TYPES = [
  "generic",
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
] as const;

export type PortType = (typeof PORT_TYPES)[number];
export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

export interface HexCoordinate {
  q: number;
  r: number;
}

export interface BoardHex {
  coordinate: HexCoordinate;
  terrain: TerrainType;
  numberToken: NumberTokenValue | null;
}

export interface BoardPort {
  landCoordinate: HexCoordinate;
  direction: HexDirection;
  type: PortType;
}

export type TerrainCounts = Record<TerrainType, number>;
export type NumberTokenCounts = Record<NumberTokenValue, number>;
export type PortCounts = Record<PortType, number>;

export interface BoardInventory {
  terrain: TerrainCounts;
  numbers: NumberTokenCounts;
  ports: PortCounts;
}

export interface BoardDesign {
  documentVersion: typeof BOARD_DOCUMENT_VERSION;
  id: BoardDesignId;
  revision: number;
  name: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  inventory: BoardInventory;
  footprint: HexCoordinate[];
  hexes: BoardHex[];
  ports: BoardPort[];
}

export interface BoardDesignSummary {
  id: BoardDesignId;
  revision: number;
  name: string;
  updatedAt: IsoTimestamp;
  hexCount: number;
  issueCount: number;
}

export interface GeneratedBoardLayout {
  hexes: BoardHex[];
  ports: BoardPort[];
}

export type BoardValidationSeverity = "error" | "warning" | "info";

export type BoardValidationCode =
  | "empty-board"
  | "invalid-coordinate"
  | "duplicate-coordinate"
  | "disconnected-board"
  | "asymmetric-footprint"
  | "footprint-size-mismatch"
  | "small-island"
  | "inventory-exceeded"
  | "unplaced-inventory"
  | "invalid-number-token"
  | "missing-number-token"
  | "invalid-port"
  | "adjacent-red-numbers"
  | "paired-high-numbers"
  | "repeated-number-vertex"
  | "vertex-pip-overload"
  | "terrain-cluster"
  | "production-hotspot"
  | "uneven-resource-production"
  | "clustered-ports";

export interface BoardValidationIssue {
  code: BoardValidationCode;
  severity: BoardValidationSeverity;
  message: string;
  coordinates: HexCoordinate[];
}

export type BoardCommand =
  | {
      type: "inventory.countSet";
      category: "terrain";
      item: TerrainType;
      count: number;
    }
  | {
      type: "inventory.countSet";
      category: "number";
      item: NumberTokenValue;
      count: number;
    }
  | {
      type: "inventory.countSet";
      category: "port";
      item: PortType;
      count: number;
    }
  | {
      type: "hex.placed";
      coordinate: HexCoordinate;
      terrain: TerrainType;
    }
  | {
      type: "hex.terrainChanged";
      coordinate: HexCoordinate;
      terrain: TerrainType;
    }
  | { type: "hex.removed"; coordinate: HexCoordinate }
  | {
      type: "hex.moved";
      from: HexCoordinate;
      to: HexCoordinate;
    }
  | {
      type: "numberToken.set";
      coordinate: HexCoordinate;
      value: NumberTokenValue | null;
    }
  | {
      type: "port.set";
      landCoordinate: HexCoordinate;
      direction: HexDirection;
      portType: PortType | null;
    }
  | { type: "footprint.replaced"; coordinates: HexCoordinate[] }
  | { type: "footprint.pairAdded"; coordinate: HexCoordinate }
  | { type: "footprint.pairRemoved"; coordinate: HexCoordinate }
  | { type: "layout.replaced"; layout: GeneratedBoardLayout }
  | { type: "design.renamed"; name: string };

export type BoardMutationErrorCode =
  | "invalid-count"
  | "inventory-exhausted"
  | "position-occupied"
  | "position-empty"
  | "disconnected-placement"
  | "invalid-number-target"
  | "invalid-port-target"
  | "invalid-footprint"
  | "invalid-layout"
  | "invalid-name";

export interface BoardMutationError {
  code: BoardMutationErrorCode;
  message: string;
}

export type BoardMutationResult<T> =
  { ok: true; value: T } | { ok: false; error: BoardMutationError };
