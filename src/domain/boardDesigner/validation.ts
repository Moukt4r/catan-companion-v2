import {
  areAdjacent,
  boardVertices,
  connectedHexGroups,
  coordinateKey,
  edgeKey,
  findHex,
  isConnected,
  isValidPortPlacement,
  neighbors,
  sameCoordinate,
} from "./coordinates";
import { isSymmetricFootprint } from "./footprint";
import {
  isProducingTerrain,
  placedInventory,
  totalNumbers,
  totalPorts,
  totalTerrain,
} from "./inventory";
import {
  NUMBER_TOKEN_VALUES,
  PORT_TYPES,
  PRODUCING_TERRAINS,
  TERRAIN_TYPES,
  type BoardDesign,
  type BoardHex,
  type BoardValidationIssue,
  type HexCoordinate,
  type NumberTokenValue,
  type ProducingTerrain,
} from "./types";

export const NUMBER_TOKEN_PIPS: Record<NumberTokenValue, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

/**
 * Highest combined pip count allowed on a single vertex.
 *
 * A settlement collects from every hex touching its corner, so the pip sum at
 * a vertex is what a player actually earns there. Capping it keeps any one
 * building spot from dominating the board: 8 + 4 + 2 sums to 9 and is fine,
 * while 6 + 10 + 3 sums to 11 and is not.
 */
export const MAX_VERTEX_PIPS = 9;

/** Pip value of a hex, treating unnumbered and desert hexes as zero. */
function hexPips(hex: BoardHex | undefined): number {
  return hex?.numberToken ? NUMBER_TOKEN_PIPS[hex.numberToken] : 0;
}

/**
 * Vertices whose combined pip count exceeds {@link MAX_VERTEX_PIPS}, together
 * with the sum, worst first.
 */
export function overloadedVertices(
  hexes: readonly BoardHex[],
): Array<{ pips: number; coordinates: HexCoordinate[] }> {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const overloaded: Array<{ pips: number; coordinates: HexCoordinate[] }> = [];

  for (const vertex of boardVertices(hexes.map((hex) => hex.coordinate))) {
    const pips = vertex.coordinates.reduce(
      (total, coordinate) =>
        total + hexPips(byKey.get(coordinateKey(coordinate))),
      0,
    );
    if (pips > MAX_VERTEX_PIPS) {
      overloaded.push({ pips, coordinates: vertex.coordinates });
    }
  }

  return overloaded.sort((left, right) => right.pips - left.pips);
}

function issue(
  value: Omit<BoardValidationIssue, "coordinates"> & {
    coordinates?: HexCoordinate[];
  },
): BoardValidationIssue {
  return { ...value, coordinates: value.coordinates ?? [] };
}

function sameTerrainClusters(hexes: readonly BoardHex[]): BoardHex[][] {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const visited = new Set<string>();
  const clusters: BoardHex[][] = [];

  for (const hex of hexes) {
    if (
      hex.terrain === "sea" ||
      hex.terrain === "desert" ||
      visited.has(coordinateKey(hex.coordinate))
    ) {
      continue;
    }
    const cluster: BoardHex[] = [];
    const queue = [hex];
    visited.add(coordinateKey(hex.coordinate));
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      cluster.push(current);
      for (const coordinate of neighbors(current.coordinate)) {
        const candidate = byKey.get(coordinateKey(coordinate));
        if (
          candidate?.terrain === current.terrain &&
          !visited.has(coordinateKey(candidate.coordinate))
        ) {
          visited.add(coordinateKey(candidate.coordinate));
          queue.push(candidate);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function productionByTerrain(
  hexes: readonly BoardHex[],
): Record<ProducingTerrain, { pips: number; tiles: number }> {
  const production: Record<ProducingTerrain, { pips: number; tiles: number }> =
    {
      forest: { pips: 0, tiles: 0 },
      pasture: { pips: 0, tiles: 0 },
      fields: { pips: 0, tiles: 0 },
      hills: { pips: 0, tiles: 0 },
      mountains: { pips: 0, tiles: 0 },
      gold: { pips: 0, tiles: 0 },
    };
  for (const hex of hexes) {
    if (!isProducingTerrain(hex.terrain)) {
      continue;
    }
    production[hex.terrain].tiles += 1;
    if (hex.numberToken !== null) {
      production[hex.terrain].pips += NUMBER_TOKEN_PIPS[hex.numberToken];
    }
  }
  return production;
}

export function validateBoardDesign(
  design: BoardDesign,
): BoardValidationIssue[] {
  const issues: BoardValidationIssue[] = [];
  const coordinateCounts = new Map<string, number>();
  for (const hex of design.hexes) {
    const key = coordinateKey(hex.coordinate);
    coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
    if (
      !Number.isSafeInteger(hex.coordinate.q) ||
      !Number.isSafeInteger(hex.coordinate.r)
    ) {
      issues.push(
        issue({
          code: "invalid-coordinate",
          severity: "error",
          message: "A hex has an invalid grid coordinate.",
          coordinates: [hex.coordinate],
        }),
      );
    }
    if (hex.numberToken !== null && !isProducingTerrain(hex.terrain)) {
      issues.push(
        issue({
          code: "invalid-number-token",
          severity: "error",
          message: "A number token is attached to non-producing terrain.",
          coordinates: [hex.coordinate],
        }),
      );
    }
  }

  const duplicates = design.hexes
    .filter(
      (hex) => (coordinateCounts.get(coordinateKey(hex.coordinate)) ?? 0) > 1,
    )
    .map((hex) => hex.coordinate);
  if (duplicates.length > 0) {
    issues.push(
      issue({
        code: "duplicate-coordinate",
        severity: "error",
        message: "Two or more hexes occupy the same grid coordinate.",
        coordinates: duplicates,
      }),
    );
  }

  const footprintHexes = design.footprint.map((coordinate) => ({
    coordinate,
    terrain: "sea" as const,
    numberToken: null,
  }));
  if (design.footprint.length === 0 && design.hexes.length === 0) {
    issues.push(
      issue({
        code: "empty-board",
        severity: "info",
        message: "Place a tile or generate a layout to begin.",
      }),
    );
  } else if (design.footprint.length > 0 && !isConnected(footprintHexes)) {
    issues.push(
      issue({
        code: "disconnected-board",
        severity: "error",
        message: "The board border contains disconnected groups of cells.",
        coordinates: design.footprint,
      }),
    );
  } else if (design.footprint.length === 0 && !isConnected(design.hexes)) {
    issues.push(
      issue({
        code: "disconnected-board",
        severity: "error",
        message: "The board contains disconnected groups of hexes.",
        coordinates: design.hexes.map((hex) => hex.coordinate),
      }),
    );
  }

  if (design.footprint.length > 0 && !isSymmetricFootprint(design.footprint)) {
    issues.push(
      issue({
        code: "asymmetric-footprint",
        severity: "warning",
        message: "The board border is not 180-degree symmetric.",
        coordinates: design.footprint,
      }),
    );
  }

  if (
    design.footprint.length > 0 &&
    design.footprint.length !== totalTerrain(design.inventory)
  ) {
    issues.push(
      issue({
        code: "footprint-size-mismatch",
        severity: "warning",
        message: `The border has ${design.footprint.length} cells for ${totalTerrain(
          design.inventory,
        )} terrain tiles.`,
        coordinates: design.footprint,
      }),
    );
  }

  const layoutComplete =
    design.footprint.length === 0 ||
    design.hexes.length === design.footprint.length;
  const smallIslands = layoutComplete
    ? connectedHexGroups(design.hexes, (hex) => hex.terrain !== "sea").filter(
        (group) => group.length < 3,
      )
    : [];
  if (smallIslands.length > 0) {
    issues.push(
      issue({
        code: "small-island",
        severity: "warning",
        message: `${smallIslands.length} land ${
          smallIslands.length === 1 ? "island has" : "islands have"
        } fewer than three tiles.`,
        coordinates: smallIslands.flatMap((group) =>
          group.map((hex) => hex.coordinate),
        ),
      }),
    );
  }

  const placed = placedInventory(design);
  const exceeded =
    TERRAIN_TYPES.some(
      (item) => placed.terrain[item] > design.inventory.terrain[item],
    ) ||
    NUMBER_TOKEN_VALUES.some(
      (item) => placed.numbers[item] > design.inventory.numbers[item],
    ) ||
    PORT_TYPES.some(
      (item) => placed.ports[item] > design.inventory.ports[item],
    );
  if (exceeded) {
    issues.push(
      issue({
        code: "inventory-exceeded",
        severity: "error",
        message: "The layout uses more pieces than its selected inventory.",
      }),
    );
  }

  if (
    design.hexes.length < totalTerrain(design.inventory) ||
    design.hexes.filter((hex) => hex.numberToken !== null).length <
      totalNumbers(design.inventory) ||
    design.ports.length < totalPorts(design.inventory)
  ) {
    issues.push(
      issue({
        code: "unplaced-inventory",
        severity: "info",
        message: "Some selected pieces remain in the inventory.",
      }),
    );
  }

  const missingNumbers = design.hexes
    .filter(
      (hex) => isProducingTerrain(hex.terrain) && hex.numberToken === null,
    )
    .map((hex) => hex.coordinate);
  if (missingNumbers.length > 0) {
    issues.push(
      issue({
        code: "missing-number-token",
        severity: "info",
        message: `${missingNumbers.length} producing ${
          missingNumbers.length === 1 ? "hex has" : "hexes have"
        } no number token.`,
        coordinates: missingNumbers,
      }),
    );
  }

  const edgeCounts = new Map<string, number>();
  const invalidPorts: HexCoordinate[] = [];
  for (const port of design.ports) {
    const key = edgeKey(port.landCoordinate, port.direction);
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    if (!isValidPortPlacement(port, design.hexes)) {
      invalidPorts.push(port.landCoordinate);
    }
  }
  if (
    invalidPorts.length > 0 ||
    [...edgeCounts.values()].some((count) => count > 1)
  ) {
    issues.push(
      issue({
        code: "invalid-port",
        severity: "error",
        message: "A port is duplicated or does not face adjacent sea.",
        coordinates: invalidPorts,
      }),
    );
  }

  const redPairs: HexCoordinate[] = [];
  for (const hex of design.hexes) {
    if (hex.numberToken !== 6 && hex.numberToken !== 8) {
      continue;
    }
    for (const other of design.hexes) {
      if (
        (other.numberToken === 6 || other.numberToken === 8) &&
        coordinateKey(hex.coordinate) < coordinateKey(other.coordinate) &&
        areAdjacent(hex.coordinate, other.coordinate)
      ) {
        redPairs.push(hex.coordinate, other.coordinate);
      }
    }
  }
  if (redPairs.length > 0) {
    issues.push(
      issue({
        code: "adjacent-red-numbers",
        severity: "warning",
        message: "High-production 6 or 8 tokens are adjacent.",
        coordinates: redPairs,
      }),
    );
  }

  const overloaded = overloadedVertices(design.hexes);
  if (overloaded.length > 0) {
    const worst = overloaded[0]?.pips ?? 0;
    issues.push(
      issue({
        code: "vertex-pip-overload",
        severity: "warning",
        message:
          overloaded.length === 1
            ? `One building spot totals ${worst} pips, above the limit of ${MAX_VERTEX_PIPS}.`
            : `${overloaded.length} building spots exceed ${MAX_VERTEX_PIPS} pips; the highest totals ${worst}.`,
        coordinates: overloaded.flatMap((vertex) => vertex.coordinates),
      }),
    );
  }

  for (const cluster of sameTerrainClusters(design.hexes)) {
    if (cluster.length >= 4) {
      issues.push(
        issue({
          code: "terrain-cluster",
          severity: "warning",
          message: `${cluster.length} matching resource hexes form one cluster.`,
          coordinates: cluster.map((hex) => hex.coordinate),
        }),
      );
    }
  }

  const hotspots = design.hexes.filter((hex) => {
    if (hex.numberToken === null) {
      return false;
    }
    const localPips = [hex.coordinate, ...neighbors(hex.coordinate)].reduce(
      (total, coordinate) => {
        const candidate = findHex(design.hexes, coordinate);
        return (
          total +
          (candidate?.numberToken
            ? NUMBER_TOKEN_PIPS[candidate.numberToken]
            : 0)
        );
      },
      0,
    );
    return localPips >= 20;
  });
  if (hotspots.length > 0) {
    issues.push(
      issue({
        code: "production-hotspot",
        severity: "warning",
        message: "A region concentrates several high-production numbers.",
        coordinates: hotspots.map((hex) => hex.coordinate),
      }),
    );
  }

  const production = productionByTerrain(design.hexes);
  const averages = PRODUCING_TERRAINS.map((terrain) => production[terrain])
    .filter(({ tiles }) => tiles > 0)
    .map(({ pips, tiles }) => pips / tiles);
  if (
    averages.length >= 3 &&
    Math.max(...averages) - Math.min(...averages) >= 2.5
  ) {
    issues.push(
      issue({
        code: "uneven-resource-production",
        severity: "warning",
        message: "Average number-token production varies sharply by resource.",
      }),
    );
  }

  const clusteredPorts = design.ports.filter((port, index) =>
    design.ports.some(
      (other, otherIndex) =>
        otherIndex > index &&
        (sameCoordinate(port.landCoordinate, other.landCoordinate) ||
          areAdjacent(port.landCoordinate, other.landCoordinate)),
    ),
  );
  if (clusteredPorts.length > 0) {
    issues.push(
      issue({
        code: "clustered-ports",
        severity: "warning",
        message: "Some ports are concentrated along the same coastline.",
        coordinates: clusteredPorts.map((port) => port.landCoordinate),
      }),
    );
  }

  return issues;
}
