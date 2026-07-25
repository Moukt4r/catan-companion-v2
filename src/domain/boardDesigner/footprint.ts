import {
  connectedHexGroups,
  coordinateKey,
  hexDistance,
  isConnected,
  neighbors,
} from "./coordinates";
import {
  MAX_BOARD_HEXES,
  type BoardMutationResult,
  type HexCoordinate,
} from "./types";

export interface SymmetricCoordinatePair {
  first: HexCoordinate;
  second: HexCoordinate;
}

export function oppositeCoordinate(
  coordinate: HexCoordinate,
  rotationOffset: HexCoordinate = { q: 0, r: 0 },
): HexCoordinate {
  return {
    q: rotationOffset.q - coordinate.q,
    r: rotationOffset.r - coordinate.r,
  };
}

export function isSymmetricFootprint(
  coordinates: readonly HexCoordinate[],
): boolean {
  return findFootprintRotationOffset(coordinates) !== null;
}

export function createSymmetricFootprint(
  count: number,
): BoardMutationResult<HexCoordinate[]> {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_BOARD_HEXES) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `A border must contain between 0 and ${MAX_BOARD_HEXES} cells.`,
      },
    };
  }
  if (count === 0) {
    return { ok: true, value: [] };
  }
  let coordinates: HexCoordinate[] =
    count % 2 === 1
      ? [{ q: 0, r: 0 }]
      : [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ];
  while (coordinates.length < count) {
    const pair = symmetricExpansionPairs(coordinates)[0];
    if (!pair) {
      return {
        ok: false,
        error: {
          code: "invalid-footprint",
          message: "A symmetric border could not be created for this size.",
        },
      };
    }
    coordinates = appendPair(coordinates, pair);
  }

  return { ok: true, value: sortFootprint(coordinates) };
}

export function createSymmetricFootprintWithDimensions(
  count: number,
  width: number,
  height: number,
): BoardMutationResult<HexCoordinate[]> {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_BOARD_HEXES) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `A border must contain between 0 and ${MAX_BOARD_HEXES} cells.`,
      },
    };
  }
  if (count === 0) {
    return { ok: true, value: [] };
  }
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_BOARD_HEXES ||
    height > MAX_BOARD_HEXES
  ) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `Width and height must each be between 1 and ${MAX_BOARD_HEXES}.`,
      },
    };
  }
  const capacity = width * height;
  if (capacity < count) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `${width} × ${height} holds only ${capacity} cells, but the inventory contains ${count} tiles.`,
      },
    };
  }
  if (capacity > MAX_BOARD_HEXES) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message: `Width × height may contain at most ${MAX_BOARD_HEXES} cells.`,
      },
    };
  }
  if ((capacity - count) % 2 !== 0) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message:
          "Width × height must have the same odd or even parity as the tile count.",
      },
    };
  }
  const minimumQ = -Math.floor(width / 2);
  const minimumR = -Math.floor(height / 2);
  const maximumQ = minimumQ + width - 1;
  const maximumR = minimumR + height - 1;
  const offset = {
    q: minimumQ + maximumQ,
    r: minimumR + maximumR,
  };
  let footprint: HexCoordinate[] = [];
  for (let q = minimumQ; q <= maximumQ; q += 1) {
    for (let r = minimumR; r <= maximumR; r += 1) {
      footprint.push({ q, r });
    }
  }
  const preserveConvexity = isHexConvex(footprint);
  while (footprint.length > count) {
    const scoredCandidates = symmetricRemovalPairs(footprint)
      .map((pair) => {
        const next = removePair(footprint, pair);
        return {
          key: pairKey(pair),
          next,
          perimeter: footprintPerimeter(next),
          totalMoment: footprintTotalMoment(next, offset),
          weakCells: weakFootprintCellCount(next),
        };
      })
      .filter(
        ({ next }) =>
          footprintDimensions(next).width === width &&
          footprintDimensions(next).height === height,
      );
    const convexCandidates = preserveConvexity
      ? scoredCandidates.filter(({ next }) => isHexConvex(next))
      : scoredCandidates;
    const candidates = (
      convexCandidates.length > 0 ? convexCandidates : scoredCandidates
    ).sort(
      (left, right) =>
        left.weakCells - right.weakCells ||
        left.perimeter - right.perimeter ||
        left.totalMoment - right.totalMoment ||
        left.key.localeCompare(right.key),
    );
    const best = candidates[0];
    if (!best) {
      const fallback = findBoundedDimensionFootprint(
        count,
        minimumQ,
        maximumQ,
        minimumR,
        maximumR,
        offset,
      );
      return fallback
        ? { ok: true, value: sortFootprint(fallback) }
        : {
            ok: false,
            error: {
              code: "invalid-footprint",
              message:
                "Those dimensions cannot hold this tile count while staying connected and symmetric.",
            },
          };
    }
    footprint = best.next;
  }
  if (
    footprint.length !== count ||
    !isSymmetricFootprint(footprint) ||
    !isConnected(asHexes(footprint))
  ) {
    return {
      ok: false,
      error: {
        code: "invalid-footprint",
        message:
          "Those dimensions cannot hold this tile count while staying connected and symmetric.",
      },
    };
  }
  return { ok: true, value: sortFootprint(footprint) };
}

export function footprintDimensions(coordinates: readonly HexCoordinate[]): {
  height: number;
  width: number;
} {
  if (coordinates.length === 0) {
    return { height: 0, width: 0 };
  }
  const qValues = coordinates.map(({ q }) => q);
  const rValues = coordinates.map(({ r }) => r);
  return {
    height: Math.max(...rValues) - Math.min(...rValues) + 1,
    width: Math.max(...qValues) - Math.min(...qValues) + 1,
  };
}

function findBoundedDimensionFootprint(
  count: number,
  minimumQ: number,
  maximumQ: number,
  minimumR: number,
  maximumR: number,
  offset: HexCoordinate,
): HexCoordinate[] | null {
  if (count > 12) {
    return null;
  }
  const fixedCell =
    offset.q % 2 === 0 && offset.r % 2 === 0
      ? { q: offset.q / 2, r: offset.r / 2 }
      : null;
  if ((count % 2 === 1) !== (fixedCell !== null)) {
    return null;
  }
  const pairs = new Map<string, SymmetricCoordinatePair>();
  for (let q = minimumQ; q <= maximumQ; q += 1) {
    for (let r = minimumR; r <= maximumR; r += 1) {
      const coordinate = { q, r };
      const opposite = oppositeCoordinate(coordinate, offset);
      if (sameCoordinateForFootprint(coordinate, opposite)) {
        continue;
      }
      const pair = normalizedPair(coordinate, opposite);
      pairs.set(pairKey(pair), pair);
    }
  }
  const pairValues = [...pairs.values()].sort((left, right) =>
    pairKey(left).localeCompare(pairKey(right)),
  );
  const requiredPairs = Math.floor(count / 2);
  const maximumStates = 250_000;
  let exploredStates = 0;
  const selected: SymmetricCoordinatePair[] = [];

  const search = (start: number): HexCoordinate[] | null => {
    exploredStates += 1;
    if (exploredStates > maximumStates) {
      return null;
    }
    if (selected.length === requiredPairs) {
      const coordinates = [
        ...(fixedCell ? [fixedCell] : []),
        ...selected.flatMap((pair) => [pair.first, pair.second]),
      ];
      const dimensions = footprintDimensions(coordinates);
      return dimensions.width === maximumQ - minimumQ + 1 &&
        dimensions.height === maximumR - minimumR + 1 &&
        isConnected(asHexes(coordinates))
        ? coordinates
        : null;
    }
    const remainingNeeded = requiredPairs - selected.length;
    for (
      let index = start;
      index <= pairValues.length - remainingNeeded;
      index += 1
    ) {
      const pair = pairValues[index];
      if (!pair) {
        continue;
      }
      selected.push(pair);
      const found = search(index + 1);
      if (found) {
        return found;
      }
      selected.pop();
      if (exploredStates > maximumStates) {
        return null;
      }
    }
    return null;
  };

  return search(0);
}

function sameCoordinateForFootprint(
  left: HexCoordinate,
  right: HexCoordinate,
): boolean {
  return left.q === right.q && left.r === right.r;
}

export function createSymmetricContainingFootprint(
  coordinates: readonly HexCoordinate[],
  targetCount?: number,
): HexCoordinate[] {
  if (coordinates.length === 0) {
    if (targetCount === undefined) {
      return [];
    }
    const generated = createSymmetricFootprint(targetCount);
    return generated.ok ? generated.value : [];
  }
  if (targetCount !== undefined) {
    const standard = createSymmetricFootprint(targetCount);
    if (standard.ok) {
      const standardKeys = new Set(standard.value.map(coordinateKey));
      if (
        coordinates.every((coordinate) =>
          standardKeys.has(coordinateKey(coordinate)),
        )
      ) {
        return standard.value;
      }
    }
  }
  const qValues = coordinates.map((coordinate) => coordinate.q);
  const rValues = coordinates.map((coordinate) => coordinate.r);
  const sValues = coordinates.map((coordinate) => -coordinate.q - coordinate.r);
  const qOffset = Math.min(...qValues) + Math.max(...qValues);
  const rOffset = Math.min(...rValues) + Math.max(...rValues);
  const sOffset = Math.min(...sValues) + Math.max(...sValues);
  const initialOffsets = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: 1, r: -1 },
    { q: qOffset, r: rOffset },
    { q: qOffset, r: -qOffset - sOffset },
    { q: -rOffset - sOffset, r: rOffset },
  ];
  const detectedOffset = findFootprintRotationOffset(coordinates);
  if (detectedOffset) {
    initialOffsets.push(detectedOffset);
  }
  const uniqueOffsets = new Map(
    initialOffsets.map((offset) => [coordinateKey(offset), offset]),
  );
  const bestByParity: Array<HexCoordinate[] | undefined> = [
    undefined,
    undefined,
  ];
  const evaluate = (offset: HexCoordinate) => {
    const lowerBound = mirroredCoordinateCount(coordinates, offset);
    const parity = lowerBound % 2;
    const current = bestByParity[parity];
    if (current && lowerBound > current.length) {
      return;
    }
    const candidate = buildContainingFootprint(coordinates, offset);
    const candidateParity = candidate.length % 2;
    const currentCandidate = bestByParity[candidateParity];
    if (
      currentCandidate === undefined ||
      candidate.length < currentCandidate.length ||
      (candidate.length === currentCandidate.length &&
        maximumDistance(candidate) < maximumDistance(currentCandidate))
    ) {
      bestByParity[candidateParity] = candidate;
    }
  };
  for (const offset of uniqueOffsets.values()) {
    evaluate(offset);
  }

  for (let leftIndex = 0; leftIndex < coordinates.length; leftIndex += 1) {
    const left = coordinates[leftIndex];
    if (!left) {
      continue;
    }
    for (
      let rightIndex = leftIndex;
      rightIndex < coordinates.length;
      rightIndex += 1
    ) {
      const right = coordinates[rightIndex];
      if (!right) {
        continue;
      }
      const offset = { q: left.q + right.q, r: left.r + right.r };
      const key = coordinateKey(offset);
      if (uniqueOffsets.has(key)) {
        continue;
      }
      uniqueOffsets.set(key, offset);
      evaluate(offset);
    }
  }

  if (targetCount !== undefined) {
    if (targetCount <= 32) {
      for (let q = qOffset - targetCount; q <= qOffset + targetCount; q += 1) {
        for (
          let r = rOffset - targetCount;
          r <= rOffset + targetCount;
          r += 1
        ) {
          const hasFixedCell = q % 2 === 0 && r % 2 === 0;
          if (
            (targetCount % 2 === 1 && !hasFixedCell) ||
            (targetCount % 2 === 0 && hasFixedCell)
          ) {
            continue;
          }
          const offset = { q, r };
          const key = coordinateKey(offset);
          if (!uniqueOffsets.has(key)) {
            uniqueOffsets.set(key, offset);
          }
        }
      }
    }
    const exact = findExactTargetFootprint(coordinates, targetCount, [
      ...uniqueOffsets.values(),
    ]);
    if (exact) {
      return exact;
    }
    let matching = bestByParity[targetCount % 2];
    if (matching && matching.length <= targetCount) {
      while (matching.length < targetCount) {
        const pair = symmetricExpansionPairs(matching)[0];
        if (!pair) {
          break;
        }
        matching = appendPair(matching, pair);
      }
      if (matching.length === targetCount) {
        return matching;
      }
    }
  }

  return [bestByParity[0], bestByParity[1]]
    .filter(
      (candidate): candidate is HexCoordinate[] => candidate !== undefined,
    )
    .sort(
      (left, right) =>
        left.length - right.length ||
        maximumDistance(left) - maximumDistance(right),
    )[0]!;
}

function findExactTargetFootprint(
  coordinates: readonly HexCoordinate[],
  targetCount: number,
  offsets: readonly HexCoordinate[],
): HexCoordinate[] | null {
  if (
    targetCount < coordinates.length ||
    (targetCount > 32 && targetCount - coordinates.length > 10)
  ) {
    return null;
  }
  const results: HexCoordinate[][] = [];
  let exploredStates = 0;
  const maximumStates = 100_000;

  for (const offset of offsets) {
    const initial = new Map<string, HexCoordinate>();
    for (const coordinate of coordinates) {
      initial.set(coordinateKey(coordinate), { ...coordinate });
      const opposite = oppositeCoordinate(coordinate, offset);
      initial.set(coordinateKey(opposite), opposite);
    }
    if (initial.size > targetCount) {
      continue;
    }
    const queue = [initial];
    const seen = new Set([coordinateMapKey(initial)]);
    while (queue.length > 0 && exploredStates < maximumStates) {
      exploredStates += 1;
      const state = queue.shift();
      if (!state) {
        continue;
      }
      if (
        state.size === targetCount &&
        isConnected(asHexes([...state.values()]))
      ) {
        results.push(sortFootprint([...state.values()]));
        break;
      }
      if (state.size >= targetCount) {
        continue;
      }
      const candidates = new Map<string, HexCoordinate>();
      for (const coordinate of state.values()) {
        for (const candidate of neighbors(coordinate)) {
          if (!state.has(coordinateKey(candidate))) {
            candidates.set(coordinateKey(candidate), candidate);
          }
        }
      }
      for (const candidate of candidates.values()) {
        const next = new Map(state);
        next.set(coordinateKey(candidate), { ...candidate });
        const opposite = oppositeCoordinate(candidate, offset);
        next.set(coordinateKey(opposite), opposite);
        if (next.size > targetCount) {
          continue;
        }
        const key = coordinateMapKey(next);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        queue.push(next);
      }
    }
    if (exploredStates >= maximumStates) {
      break;
    }
  }

  return (
    results.sort(
      (left, right) => maximumDistance(left) - maximumDistance(right),
    )[0] ?? null
  );
}

function coordinateMapKey(
  coordinates: ReadonlyMap<string, HexCoordinate>,
): string {
  return [...coordinates.keys()].sort().join("|");
}

export function symmetricExpansionPairs(
  coordinates: readonly HexCoordinate[],
): SymmetricCoordinatePair[] {
  if (coordinates.length === 0) {
    return [
      {
        first: { q: 0, r: 0 },
        second: { q: 0, r: 0 },
      },
    ];
  }
  const keys = new Set(coordinates.map(coordinateKey));
  const offset = findFootprintRotationOffset(coordinates);
  if (!offset) {
    return [];
  }
  const pairs = new Map<string, SymmetricCoordinatePair>();
  for (const coordinate of coordinates) {
    for (const candidate of neighbors(coordinate)) {
      const opposite = oppositeCoordinate(candidate, offset);
      if (
        keys.has(coordinateKey(candidate)) ||
        keys.has(coordinateKey(opposite))
      ) {
        continue;
      }
      if (
        coordinates.length > 0 &&
        coordinateKey(candidate) === coordinateKey(opposite)
      ) {
        continue;
      }
      const pair = normalizedPair(candidate, opposite);
      const next = appendPair(coordinates, pair);
      if (!isConnected(asHexes(next))) {
        continue;
      }
      pairs.set(pairKey(pair), pair);
    }
  }

  return [...pairs.values()].sort((left, right) => {
    const leftDistance = Math.max(
      hexDistance(left.first),
      hexDistance(left.second),
    );
    const rightDistance = Math.max(
      hexDistance(right.first),
      hexDistance(right.second),
    );
    return (
      leftDistance - rightDistance ||
      pairTouchCount(right, keys) - pairTouchCount(left, keys) ||
      pairKey(left).localeCompare(pairKey(right))
    );
  });
}

export function symmetricRemovalPairs(
  coordinates: readonly HexCoordinate[],
): SymmetricCoordinatePair[] {
  const keys = new Set(coordinates.map(coordinateKey));
  const offset = findFootprintRotationOffset(coordinates);
  if (!offset) {
    return [];
  }
  const pairs = new Map<string, SymmetricCoordinatePair>();
  for (const coordinate of coordinates) {
    const opposite = oppositeCoordinate(coordinate, offset);
    if (!keys.has(coordinateKey(opposite))) {
      continue;
    }
    const pair = normalizedPair(coordinate, opposite);
    if (
      coordinates.length > 1 &&
      coordinateKey(pair.first) === coordinateKey(pair.second)
    ) {
      continue;
    }
    if (
      [pair.first, pair.second].some(
        (item) =>
          neighbors(item).filter((neighbor) =>
            keys.has(coordinateKey(neighbor)),
          ).length === 6,
      )
    ) {
      continue;
    }
    const removeKeys = new Set([
      coordinateKey(pair.first),
      coordinateKey(pair.second),
    ]);
    const next = coordinates.filter(
      (item) => !removeKeys.has(coordinateKey(item)),
    );
    if (next.length > 0 && !isConnected(asHexes(next))) {
      continue;
    }
    pairs.set(pairKey(pair), pair);
  }
  return [...pairs.values()].sort((left, right) =>
    pairKey(left).localeCompare(pairKey(right)),
  );
}

export function findSymmetricPair(
  pairs: readonly SymmetricCoordinatePair[],
  coordinate: HexCoordinate,
): SymmetricCoordinatePair | undefined {
  const key = coordinateKey(coordinate);
  return pairs.find(
    (pair) =>
      coordinateKey(pair.first) === key || coordinateKey(pair.second) === key,
  );
}

export function appendPair(
  coordinates: readonly HexCoordinate[],
  pair: SymmetricCoordinatePair,
): HexCoordinate[] {
  const byKey = new Map(
    coordinates.map((coordinate) => [
      coordinateKey(coordinate),
      { ...coordinate },
    ]),
  );
  byKey.set(coordinateKey(pair.first), { ...pair.first });
  byKey.set(coordinateKey(pair.second), { ...pair.second });
  return [...byKey.values()];
}

export function removePair(
  coordinates: readonly HexCoordinate[],
  pair: SymmetricCoordinatePair,
): HexCoordinate[] {
  const removeKeys = new Set([
    coordinateKey(pair.first),
    coordinateKey(pair.second),
  ]);
  return coordinates
    .filter((coordinate) => !removeKeys.has(coordinateKey(coordinate)))
    .map((coordinate) => ({ ...coordinate }));
}

function normalizedPair(
  first: HexCoordinate,
  second: HexCoordinate,
): SymmetricCoordinatePair {
  return coordinateKey(first) <= coordinateKey(second)
    ? { first: { ...first }, second: { ...second } }
    : { first: { ...second }, second: { ...first } };
}

export function findFootprintRotationOffset(
  coordinates: readonly HexCoordinate[],
): HexCoordinate | null {
  if (coordinates.length === 0) {
    return { q: 0, r: 0 };
  }
  const keys = new Set(coordinates.map(coordinateKey));
  const first = coordinates[0];
  if (!first) {
    return { q: 0, r: 0 };
  }
  const candidates = coordinates
    .map((coordinate) => ({
      q: first.q + coordinate.q,
      r: first.r + coordinate.r,
    }))
    .sort((left, right) =>
      coordinateKey(left).localeCompare(coordinateKey(right)),
    );
  return (
    candidates.find((offset) =>
      coordinates.every((coordinate) =>
        keys.has(coordinateKey(oppositeCoordinate(coordinate, offset))),
      ),
    ) ?? null
  );
}

function pairKey(pair: SymmetricCoordinatePair): string {
  return `${coordinateKey(pair.first)}|${coordinateKey(pair.second)}`;
}

function isHexConvex(coordinates: readonly HexCoordinate[]): boolean {
  for (const axis of [0, 1, 2]) {
    const lines = new Map<number, number[]>();
    for (const coordinate of coordinates) {
      const line = coordinateAxisValue(coordinate, axis);
      const along = axis === 0 ? coordinate.r : coordinate.q;
      const values = lines.get(line) ?? [];
      values.push(along);
      lines.set(line, values);
    }
    for (const values of lines.values()) {
      if (Math.max(...values) - Math.min(...values) + 1 !== values.length) {
        return false;
      }
    }
  }
  return true;
}

function footprintPerimeter(coordinates: readonly HexCoordinate[]): number {
  const keys = new Set(coordinates.map(coordinateKey));
  return coordinates.reduce(
    (total, coordinate) =>
      total +
      neighbors(coordinate).filter(
        (candidate) => !keys.has(coordinateKey(candidate)),
      ).length,
    0,
  );
}

function weakFootprintCellCount(coordinates: readonly HexCoordinate[]): number {
  if (coordinates.length <= 2) {
    return 0;
  }
  const keys = new Set(coordinates.map(coordinateKey));
  return coordinates.filter(
    (coordinate) =>
      neighbors(coordinate).filter((candidate) =>
        keys.has(coordinateKey(candidate)),
      ).length < 2,
  ).length;
}

function footprintAxisMoment(
  coordinates: readonly HexCoordinate[],
  axis: number,
  offset: HexCoordinate,
): number {
  const centerOffset = coordinateAxisValue(offset, axis);
  return coordinates.reduce((total, coordinate) => {
    const distance = 2 * coordinateAxisValue(coordinate, axis) - centerOffset;
    return total + distance * distance;
  }, 0);
}

function footprintTotalMoment(
  coordinates: readonly HexCoordinate[],
  offset: HexCoordinate,
): number {
  return [0, 1, 2].reduce(
    (total, axis) => total + footprintAxisMoment(coordinates, axis, offset),
    0,
  );
}

function coordinateAxisValue(coordinate: HexCoordinate, axis: number): number {
  return axis === 0
    ? coordinate.q
    : axis === 1
      ? coordinate.r
      : -coordinate.q - coordinate.r;
}

function pairTouchCount(
  pair: SymmetricCoordinatePair,
  footprintKeys: ReadonlySet<string>,
): number {
  return [pair.first, pair.second].reduce(
    (total, coordinate) =>
      total +
      neighbors(coordinate).filter((neighbor) =>
        footprintKeys.has(coordinateKey(neighbor)),
      ).length,
    0,
  );
}

function sortFootprint(coordinates: readonly HexCoordinate[]): HexCoordinate[] {
  return [...coordinates].sort((left, right) =>
    left.r === right.r ? left.q - right.q : left.r - right.r,
  );
}

function buildContainingFootprint(
  coordinates: readonly HexCoordinate[],
  offset: HexCoordinate,
): HexCoordinate[] {
  const byKey = new Map<string, HexCoordinate>();
  const addWithOpposite = (coordinate: HexCoordinate) => {
    const opposite = oppositeCoordinate(coordinate, offset);
    byKey.set(coordinateKey(coordinate), { ...coordinate });
    byKey.set(coordinateKey(opposite), opposite);
  };
  for (const coordinate of coordinates) {
    addWithOpposite(coordinate);
  }

  for (;;) {
    const groups = connectedHexGroups(asHexes([...byKey.values()]));
    if (groups.length <= 1) {
      return sortFootprint([...byKey.values()]);
    }
    let closest:
      | {
          addedCells: number;
          distance: number;
          from: HexCoordinate;
          path: HexCoordinate[];
          to: HexCoordinate;
        }
      | undefined;
    for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
      const left = groups[leftIndex];
      if (!left) {
        continue;
      }
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < groups.length;
        rightIndex += 1
      ) {
        const right = groups[rightIndex];
        if (!right) {
          continue;
        }
        for (const leftHex of left) {
          for (const rightHex of right) {
            const distance = hexDistance(
              leftHex.coordinate,
              rightHex.coordinate,
            );
            const path = minimumMirroredShortestPath(
              leftHex.coordinate,
              rightHex.coordinate,
              offset,
              new Set(byKey.keys()),
            );
            const key = `${coordinateKey(
              leftHex.coordinate,
            )}|${coordinateKey(rightHex.coordinate)}`;
            const closestKey = closest
              ? `${coordinateKey(closest.from)}|${coordinateKey(closest.to)}`
              : "";
            if (
              closest === undefined ||
              distance < closest.distance ||
              (distance === closest.distance &&
                (path.addedCells < closest.addedCells ||
                  (path.addedCells === closest.addedCells && key < closestKey)))
            ) {
              closest = {
                addedCells: path.addedCells,
                distance,
                from: leftHex.coordinate,
                path: path.coordinates,
                to: rightHex.coordinate,
              };
            }
          }
        }
      }
    }
    if (!closest) {
      return sortFootprint([...byKey.values()]);
    }
    for (const coordinate of closest.path) {
      addWithOpposite(coordinate);
    }
  }
}

function minimumMirroredShortestPath(
  from: HexCoordinate,
  to: HexCoordinate,
  offset: HexCoordinate,
  existingKeys: ReadonlySet<string>,
): { addedCells: number; coordinates: HexCoordinate[] } {
  interface PathState {
    addedKeys: Set<string>;
    coordinates: HexCoordinate[];
    current: HexCoordinate;
  }

  const initialDistance = hexDistance(from, to);
  let states: PathState[] = [
    {
      addedKeys: new Set(),
      coordinates: [],
      current: { ...from },
    },
  ];
  for (let step = 0; step < initialDistance; step += 1) {
    const byCoordinate = new Map<string, PathState[]>();
    for (const state of states) {
      const distance = hexDistance(state.current, to);
      for (const candidate of neighbors(state.current).filter(
        (coordinate) => hexDistance(coordinate, to) < distance,
      )) {
        const addedKeys = new Set(state.addedKeys);
        for (const key of mirroredKeys(candidate, offset)) {
          if (!existingKeys.has(key)) {
            addedKeys.add(key);
          }
        }
        const next: PathState = {
          addedKeys,
          coordinates: [...state.coordinates, candidate],
          current: candidate,
        };
        const key = coordinateKey(candidate);
        const candidates = byCoordinate.get(key) ?? [];
        candidates.push(next);
        candidates.sort(comparePathStates);
        byCoordinate.set(
          key,
          initialDistance <= 16 ? candidates : candidates.slice(0, 8),
        );
      }
    }
    states = [...byCoordinate.values()].flat();
    if (initialDistance > 16 && states.length > 4_096) {
      states.sort(comparePathStates);
      states = states.slice(0, 4_096);
    }
  }
  states.sort(comparePathStates);
  const best = states.find(
    (state) => coordinateKey(state.current) === coordinateKey(to),
  );
  return best
    ? { addedCells: best.addedKeys.size, coordinates: best.coordinates }
    : { addedCells: 0, coordinates: [] };
}

function comparePathStates(
  left: {
    addedKeys: ReadonlySet<string>;
    coordinates: readonly HexCoordinate[];
  },
  right: {
    addedKeys: ReadonlySet<string>;
    coordinates: readonly HexCoordinate[];
  },
): number {
  return (
    left.addedKeys.size - right.addedKeys.size ||
    left.coordinates
      .map(coordinateKey)
      .join("|")
      .localeCompare(right.coordinates.map(coordinateKey).join("|"))
  );
}

function mirroredKeys(
  coordinate: HexCoordinate,
  offset: HexCoordinate,
): string[] {
  return [
    ...new Set([
      coordinateKey(coordinate),
      coordinateKey(oppositeCoordinate(coordinate, offset)),
    ]),
  ];
}

function maximumDistance(coordinates: readonly HexCoordinate[]): number {
  return Math.max(...coordinates.map((coordinate) => hexDistance(coordinate)));
}

function mirroredCoordinateCount(
  coordinates: readonly HexCoordinate[],
  offset: HexCoordinate,
): number {
  const keys = new Set<string>();
  for (const coordinate of coordinates) {
    keys.add(coordinateKey(coordinate));
    keys.add(coordinateKey(oppositeCoordinate(coordinate, offset)));
  }
  return keys.size;
}

function asHexes(coordinates: readonly HexCoordinate[]) {
  return coordinates.map((coordinate) => ({
    coordinate,
    terrain: "sea" as const,
    numberToken: null,
  }));
}
