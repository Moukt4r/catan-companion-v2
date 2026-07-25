import type { BoardHex, BoardPort, HexCoordinate, HexDirection } from "./types";

export const HEX_DIRECTIONS: ReadonlyArray<HexCoordinate> = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export interface PixelPoint {
  x: number;
  y: number;
}

export interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function coordinateKey(coordinate: HexCoordinate): string {
  return `${coordinate.q},${coordinate.r}`;
}

export function edgeKey(
  landCoordinate: HexCoordinate,
  direction: HexDirection,
): string {
  return `${coordinateKey(landCoordinate)}:${direction}`;
}

export function sameCoordinate(
  left: HexCoordinate,
  right: HexCoordinate,
): boolean {
  return left.q === right.q && left.r === right.r;
}

export function neighbor(
  coordinate: HexCoordinate,
  direction: HexDirection,
): HexCoordinate {
  const offset = HEX_DIRECTIONS[direction];
  if (!offset) {
    throw new Error(`Unknown hex direction ${direction}.`);
  }
  return {
    q: coordinate.q + offset.q,
    r: coordinate.r + offset.r,
  };
}

export function neighbors(coordinate: HexCoordinate): HexCoordinate[] {
  return HEX_DIRECTIONS.map((_, direction) =>
    neighbor(coordinate, direction as HexDirection),
  );
}

export function hexDistance(
  left: HexCoordinate,
  right: HexCoordinate = { q: 0, r: 0 },
): number {
  const dq = left.q - right.q;
  const dr = left.r - right.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function areAdjacent(
  left: HexCoordinate,
  right: HexCoordinate,
): boolean {
  return hexDistance(left, right) === 1;
}

export function findHex(
  hexes: readonly BoardHex[],
  coordinate: HexCoordinate,
): BoardHex | undefined {
  return hexes.find((hex) => sameCoordinate(hex.coordinate, coordinate));
}

export function connectedHexGroups(
  hexes: readonly BoardHex[],
  include: (hex: BoardHex) => boolean = () => true,
): BoardHex[][] {
  const included = new Map(
    hexes.filter(include).map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const visited = new Set<string>();
  const groups: BoardHex[][] = [];

  for (const hex of included.values()) {
    const startKey = coordinateKey(hex.coordinate);
    if (visited.has(startKey)) {
      continue;
    }
    const group: BoardHex[] = [];
    const queue = [hex.coordinate];
    visited.add(startKey);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const currentHex = included.get(coordinateKey(current));
      if (currentHex) {
        group.push(currentHex);
      }
      for (const candidate of neighbors(current)) {
        const key = coordinateKey(candidate);
        if (included.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(candidate);
        }
      }
    }
    groups.push(group);
  }

  return groups;
}

export function isConnected(hexes: readonly BoardHex[]): boolean {
  return connectedHexGroups(hexes).length <= 1;
}

export function isValidPortPlacement(
  port: BoardPort,
  hexes: readonly BoardHex[],
): boolean {
  const land = findHex(hexes, port.landCoordinate);
  const sea = findHex(hexes, neighbor(port.landCoordinate, port.direction));
  return (
    land !== undefined &&
    land.terrain !== "sea" &&
    sea !== undefined &&
    sea.terrain === "sea"
  );
}

export function sortCoordinates(
  coordinates: readonly HexCoordinate[],
): HexCoordinate[] {
  return [...coordinates].sort((left, right) =>
    left.r === right.r ? left.q - right.q : left.r - right.r,
  );
}

export function hexCenter(coordinate: HexCoordinate, size: number): PixelPoint {
  return {
    x: size * 1.5 * coordinate.q,
    y: size * Math.sqrt(3) * (coordinate.r + coordinate.q / 2),
  };
}

export function hexCornerPoints(
  coordinate: HexCoordinate,
  size: number,
): PixelPoint[] {
  const center = hexCenter(coordinate, size);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    return {
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    };
  });
}

export function portCenter(
  landCoordinate: HexCoordinate,
  direction: HexDirection,
  size: number,
): PixelPoint {
  const land = hexCenter(landCoordinate, size);
  const sea = hexCenter(neighbor(landCoordinate, direction), size);
  return {
    x: (land.x + sea.x) / 2,
    y: (land.y + sea.y) / 2,
  };
}

export function pixelBounds(
  coordinates: readonly HexCoordinate[],
  size: number,
  padding = size,
): PixelBounds {
  if (coordinates.length === 0) {
    return {
      minX: -size - padding,
      minY: -size - padding,
      maxX: size + padding,
      maxY: size + padding,
      width: (size + padding) * 2,
      height: (size + padding) * 2,
    };
  }
  const centers = coordinates.map((coordinate) => hexCenter(coordinate, size));
  const minX = Math.min(...centers.map(({ x }) => x)) - size - padding;
  const maxX = Math.max(...centers.map(({ x }) => x)) + size + padding;
  const minY =
    Math.min(...centers.map(({ y }) => y)) -
    (Math.sqrt(3) / 2) * size -
    padding;
  const maxY =
    Math.max(...centers.map(({ y }) => y)) +
    (Math.sqrt(3) / 2) * size +
    padding;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
