import type { BoundedIntSource, RandomSource } from "../types";
import { fisherYates, toBoundedInt } from "../random";
import {
  areAdjacent,
  boardVertices,
  connectedHexGroups,
  coordinateKey,
  edgeKey,
  isConnected,
  neighbor,
  neighbors,
} from "./coordinates";
import { isSymmetricFootprint } from "./footprint";
import { isProducingTerrain, totalTerrain } from "./inventory";
import {
  HIGH_PRODUCTION_PIPS,
  MAX_VERTEX_PIPS,
  NUMBER_TOKEN_PIPS,
  pairedHighNumberVertices,
  repeatedNumberVertices,
} from "./validation";
import {
  MAX_BOARD_HEXES,
  NUMBER_TOKEN_VALUES,
  PORT_TYPES,
  TERRAIN_TYPES,
  type BoardHex,
  type BoardInventory,
  type BoardMutationResult,
  type BoardPort,
  type GeneratedBoardLayout,
  type HexCoordinate,
  type HexDirection,
  type NumberTokenValue,
  type PortType,
  type TerrainType,
} from "./types";

interface CoastEdge {
  landCoordinate: HexCoordinate;
  direction: HexDirection;
  angle: number;
}

function generationFailure(message: string): BoardMutationResult<never> {
  return { ok: false, error: { code: "invalid-layout", message } };
}

function expandTerrain(inventory: BoardInventory): TerrainType[] {
  return TERRAIN_TYPES.flatMap((terrain) =>
    Array.from({ length: inventory.terrain[terrain] }, () => terrain),
  );
}

function expandNumbers(inventory: BoardInventory): NumberTokenValue[] {
  return NUMBER_TOKEN_VALUES.flatMap((value) =>
    Array.from({ length: inventory.numbers[value] }, () => value),
  );
}

function expandPorts(inventory: BoardInventory): PortType[] {
  return PORT_TYPES.flatMap((type) =>
    Array.from({ length: inventory.ports[type] }, () => type),
  );
}

function availablePortEdgeCount(hexes: readonly BoardHex[]): number {
  const terrainByCoordinate = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex.terrain]),
  );
  let count = 0;
  for (const hex of hexes) {
    if (hex.terrain === "sea") {
      continue;
    }
    for (const candidate of neighbors(hex.coordinate)) {
      if (terrainByCoordinate.get(coordinateKey(candidate)) === "sea") {
        count += 1;
      }
    }
  }
  return count;
}

function terrainLayoutScore(
  hexes: readonly BoardHex[],
  requestedPortCount: number,
): number {
  let score = 0;
  let seaAdjacencies = 0;
  for (let leftIndex = 0; leftIndex < hexes.length; leftIndex += 1) {
    const left = hexes[leftIndex];
    if (!left) {
      continue;
    }
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < hexes.length;
      rightIndex += 1
    ) {
      const right = hexes[rightIndex];
      if (!right || !areAdjacent(left.coordinate, right.coordinate)) {
        continue;
      }
      if (left.terrain === right.terrain && isProducingTerrain(left.terrain)) {
        score += 14;
      }
      if (left.terrain === "sea" && right.terrain === "sea") {
        seaAdjacencies += 1;
      }
    }
  }

  const seaCount = hexes.filter((hex) => hex.terrain === "sea").length;
  const landCount = hexes.length - seaCount;
  const maximumLandComponents = Math.floor(landCount / 3);
  const desiredLandComponents =
    landCount === 0
      ? 0
      : seaCount >= 8
        ? Math.min(3, maximumLandComponents)
        : seaCount >= 2
          ? Math.min(2, maximumLandComponents)
          : 1;
  const landGroups = connectedHexGroups(hexes, (hex) => hex.terrain !== "sea");
  const smallIslandDeficit = landGroups.reduce(
    (total, group) => total + Math.max(0, 3 - group.length),
    0,
  );
  score += smallIslandDeficit * 100_000;
  score +=
    Math.max(0, desiredLandComponents - landGroups.length) * 15_000 +
    Math.max(0, landGroups.length - desiredLandComponents) * 18;

  if (seaCount >= 2 && seaAdjacencies === 0) {
    score += 2_000;
  }

  const availablePortEdges = availablePortEdgeCount(hexes);
  score += Math.max(0, requestedPortCount - availablePortEdges) * 20_000;

  return score;
}

function numberPlacementScore(hexes: readonly BoardHex[]): number {
  let score = 0;
  const hexByCoordinate = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  for (const left of hexes) {
    const leftKey = coordinateKey(left.coordinate);
    for (const coordinate of neighbors(left.coordinate)) {
      const right = hexByCoordinate.get(coordinateKey(coordinate));
      if (!right || leftKey >= coordinateKey(right.coordinate)) {
        continue;
      }
      if (
        (left.numberToken === 6 || left.numberToken === 8) &&
        (right.numberToken === 6 || right.numberToken === 8)
      ) {
        score += 10_000;
      }
      if (left.numberToken !== null && left.numberToken === right.numberToken) {
        score += 8;
      }
    }
  }

  const production = new Map<TerrainType, { pips: number; tiles: number }>();
  for (const hex of hexes) {
    if (!isProducingTerrain(hex.terrain)) {
      continue;
    }
    const current = production.get(hex.terrain) ?? { pips: 0, tiles: 0 };
    current.tiles += 1;
    current.pips +=
      hex.numberToken === null ? 0 : NUMBER_TOKEN_PIPS[hex.numberToken];
    production.set(hex.terrain, current);
  }
  const averages = [...production.values()].map(
    ({ pips, tiles }) => pips / tiles,
  );
  if (averages.length > 1) {
    const overall =
      averages.reduce((total, value) => total + value, 0) / averages.length;
    score += averages.reduce(
      (total, value) => total + Math.abs(value - overall) * 8,
      0,
    );
  }

  for (const hex of hexes) {
    if (hex.numberToken === null) {
      continue;
    }
    const localPips = [hex.coordinate, ...neighbors(hex.coordinate)].reduce(
      (total, coordinate) => {
        const candidate = hexByCoordinate.get(coordinateKey(coordinate));
        return (
          total +
          (candidate?.numberToken
            ? NUMBER_TOKEN_PIPS[candidate.numberToken]
            : 0)
        );
      },
      0,
    );
    if (localPips > 18) {
      score += (localPips - 18) ** 2;
    }
  }

  // A settlement collects from every hex touching its corner, so an overloaded
  // vertex is a genuinely unbalanced building spot. Weighted well above the
  // soft balance terms so the optimizer treats it as near-forbidden, but below
  // the red-adjacency weight so it never trades one hard rule for another.
  score += vertexPipPenalty(hexes);

  // Two four-pip numbers on one corner, or the same number twice, both make a
  // spot stronger or swingier than its pip total suggests. Deliberately small
  // weights: even a board full of these must never total as much as a single
  // overloaded corner (1_000), so the optimizer can never buy off a hard rule
  // by clearing a pile of soft ones.
  score += pairedHighNumberPenalty(hexes) * 20;
  score += repeatedNumberVertexPenalty(hexes) * 8;

  return score;
}

/** Combined pip count for each vertex on the board. */
function vertexPipSums(hexes: readonly BoardHex[]): number[] {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  return boardVertices(hexes.map((hex) => hex.coordinate)).map((vertex) =>
    vertex.coordinates.reduce((total, coordinate) => {
      const hex = byKey.get(coordinateKey(coordinate));
      return (
        total + (hex?.numberToken ? NUMBER_TOKEN_PIPS[hex.numberToken] : 0)
      );
    }, 0),
  );
}

function vertexPipPenalty(hexes: readonly BoardHex[]): number {
  let penalty = 0;
  for (const pips of vertexPipSums(hexes)) {
    if (pips > MAX_VERTEX_PIPS) {
      penalty += 1_000 + (pips - MAX_VERTEX_PIPS) ** 2;
    }
  }
  return penalty;
}

/** Count of vertices pairing two four-pip numbers. */
function pairedHighNumberPenalty(hexes: readonly BoardHex[]): number {
  return pairedHighNumberVertices(hexes).length;
}

/** Count of vertices touching the same number more than once. */
function repeatedNumberVertexPenalty(hexes: readonly BoardHex[]): number {
  return repeatedNumberVertices(hexes).length;
}

function assignNumberTokens(
  hexes: BoardHex[],
  numbers: readonly NumberTokenValue[],
  boundedInt: BoundedIntSource,
): void {
  for (const hex of hexes) {
    hex.numberToken = null;
  }
  const producing = fisherYates(
    hexes.filter((hex) => isProducingTerrain(hex.terrain)),
    boundedInt,
  );
  const shuffledNumbers = fisherYates(numbers, boundedInt);
  for (
    let index = 0;
    index < Math.min(producing.length, shuffledNumbers.length);
    index += 1
  ) {
    const target = producing[index];
    const value = shuffledNumbers[index];
    if (target && value !== undefined) {
      target.numberToken = value;
    }
  }
}

function optimizeNumberTokens(
  source: readonly BoardHex[],
  numbers: readonly NumberTokenValue[],
  boundedInt: BoundedIntSource,
): BoardHex[] {
  const uniqueValues = new Set(numbers).size;
  const attempts =
    uniqueValues <= 1
      ? 1
      : Math.min(
          120,
          Math.max(32, numbers.length <= 24 ? numbers.length * 5 : 32),
        );
  let best: BoardHex[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = source.map((hex) => ({
      ...hex,
      coordinate: { ...hex.coordinate },
      numberToken: null,
    }));
    assignNumberTokens(candidate, numbers, boundedInt);
    const score = numberPlacementScore(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      if (score === 0) {
        break;
      }
    }
  }

  return polishNumberTokens(
    repairVertexPipOverload(repairRedNumberAdjacency(best ?? [], boundedInt)),
  );
}

/**
 * Clear strong-but-legal corners without disturbing the hard constraints.
 *
 * Two four-pip numbers on one corner, or the same number twice, both make a
 * building spot stronger or swingier than its pip total suggests. Neither
 * breaks a rule on its own, so they are cleaned up only after adjacent reds
 * and overloaded corners have been settled.
 *
 * Every candidate swap is measured against the hard constraints first and
 * rejected outright if it makes them worse. That makes a regression on the
 * stricter rules impossible by construction rather than by weighting, which
 * an earlier attempt got wrong: folding all four terms into one score moved
 * the search into different local optima and left more overloaded corners
 * than before.
 */
function polishNumberTokens(source: BoardHex[]): BoardHex[] {
  const hexes = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
  }));
  const numbered = hexes.filter((hex) => hex.numberToken !== null);
  if (numbered.length < 2) {
    return hexes;
  }

  const hexByKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const vertexGroups = boardVertices(hexes.map((hex) => hex.coordinate)).map(
    (vertex) =>
      vertex.coordinates.flatMap((coordinate) => {
        const hex = hexByKey.get(coordinateKey(coordinate));
        return hex ? [hex] : [];
      }),
  );
  const adjacentPairs: Array<[BoardHex, BoardHex]> = [];
  for (const hex of hexes) {
    for (const coordinate of neighbors(hex.coordinate)) {
      const other = hexByKey.get(coordinateKey(coordinate));
      if (
        other &&
        coordinateKey(hex.coordinate) < coordinateKey(other.coordinate)
      ) {
        adjacentPairs.push([hex, other]);
      }
    }
  }

  /** Adjacent reds and overloaded corners: never allowed to get worse. */
  const hardCost = (): number => {
    let overloaded = 0;
    for (const group of vertexGroups) {
      let pips = 0;
      for (const hex of group) {
        pips += hex.numberToken ? NUMBER_TOKEN_PIPS[hex.numberToken] : 0;
      }
      if (pips > MAX_VERTEX_PIPS) {
        overloaded += 1;
      }
    }
    let reds = 0;
    for (const [left, right] of adjacentPairs) {
      if (isRedNumber(left.numberToken) && isRedNumber(right.numberToken)) {
        reds += 1;
      }
    }
    return reds * 100 + overloaded;
  };

  /** Paired four-pip corners, then repeated numbers on a corner. */
  const softCost = (): number => {
    let paired = 0;
    let repeated = 0;
    for (const group of vertexGroups) {
      let high = 0;
      const seen = new Map<number, number>();
      for (const hex of group) {
        const token = hex.numberToken;
        if (token === null) {
          continue;
        }
        if (NUMBER_TOKEN_PIPS[token] === HIGH_PRODUCTION_PIPS) {
          high += 1;
        }
        seen.set(token, (seen.get(token) ?? 0) + 1);
      }
      if (high >= 2) {
        paired += 1;
      }
      for (const count of seen.values()) {
        if (count >= 2) {
          repeated += 1;
        }
      }
    }
    return paired * 10 + repeated;
  };

  const baselineHard = hardCost();
  let currentSoft = softCost();
  if (currentSoft === 0) {
    return hexes;
  }

  // Deterministic sweep: every ordered pair, repeated until a full pass finds
  // no improvement. No randomness, so a given board always polishes the same
  // way and the caller's draw budget is untouched.
  //
  // Bounded by an explicit work budget rather than pass count alone. Each
  // candidate swap rescores every vertex, so an unbounded sweep is quadratic
  // in tokens and cubic in board size; on a slow runner under coverage
  // instrumentation that was enough to overrun the test budget. Most of the
  // gain comes from the first couple of passes, so capping the work costs
  // almost nothing in quality.
  const swapBudget = 4_000;
  let swaps = 0;
  for (
    let pass = 0;
    pass < 4 && currentSoft > 0 && swaps < swapBudget;
    pass += 1
  ) {
    let improved = false;
    for (let left = 0; left < numbered.length; left += 1) {
      for (let right = left + 1; right < numbered.length; right += 1) {
        if (swaps >= swapBudget) {
          break;
        }
        const first = numbered[left] as BoardHex;
        const second = numbered[right] as BoardHex;
        if (first.numberToken === second.numberToken) {
          continue;
        }
        swaps += 1;
        const firstValue = first.numberToken;
        const secondValue = second.numberToken;
        first.numberToken = secondValue;
        second.numberToken = firstValue;

        const nextSoft = softCost();
        if (nextSoft < currentSoft && hardCost() <= baselineHard) {
          currentSoft = nextSoft;
          improved = true;
        } else {
          first.numberToken = firstValue;
          second.numberToken = secondValue;
        }
      }
    }
    if (!improved) {
      break;
    }
  }

  return hexes;
}

/**
 * Swap number tokens until no vertex exceeds {@link MAX_VERTEX_PIPS}.
 *
 * The weighted score already discourages overloaded vertices, but it balances
 * them against resource spread and repeat-token penalties, so a scored search
 * settles for layouts that still leave corners over the limit.
 *
 * This pass optimises for that single constraint with a deterministic greedy
 * walk: at each step it takes the swap that most reduces the combined cost,
 * accepting ties so it can cross plateaus where no single swap helps but a
 * pair of them does. It draws no randomness, so generation stays reproducible
 * for a given seed and the caller's draw budget is untouched.
 *
 * Red adjacency is folded into the same cost rather than forbidden outright,
 * weighted far above a single overloaded corner. That lets the walk pass
 * through a red-adjacent layout on the way to a better one without ever
 * settling on it.
 */
function repairVertexPipOverload(source: BoardHex[]): BoardHex[] {
  const hexes = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
  }));
  // Hold the hexes themselves rather than indices: every lookup would
  // otherwise need a defensive fallback that can never actually be reached.
  const numbered = hexes.filter((hex) => hex.numberToken !== null);
  if (numbered.length < 2) {
    return hexes;
  }

  // Geometry is fixed for the whole walk, so resolve it once instead of
  // rebuilding the vertex list on every candidate swap.
  const hexByKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  const vertexGroups = boardVertices(hexes.map((hex) => hex.coordinate)).map(
    (vertex) =>
      vertex.coordinates.flatMap((coordinate) => {
        const hex = hexByKey.get(coordinateKey(coordinate));
        return hex ? [hex] : [];
      }),
  );
  const redPairs: Array<[BoardHex, BoardHex]> = [];
  for (const hex of hexes) {
    for (const coordinate of neighbors(hex.coordinate)) {
      const other = hexByKey.get(coordinateKey(coordinate));
      if (
        other &&
        coordinateKey(hex.coordinate) < coordinateKey(other.coordinate)
      ) {
        redPairs.push([hex, other]);
      }
    }
  }

  const cost = (): number => {
    let overloaded = 0;
    for (const group of vertexGroups) {
      let pips = 0;
      for (const hex of group) {
        pips += hex.numberToken ? NUMBER_TOKEN_PIPS[hex.numberToken] : 0;
      }
      if (pips > MAX_VERTEX_PIPS) {
        overloaded += 1;
      }
    }
    let reds = 0;
    for (const [left, right] of redPairs) {
      if (isRedNumber(left.numberToken) && isRedNumber(right.numberToken)) {
        reds += 1;
      }
    }
    // Hard constraints only. The soft preferences are handled by a separate
    // pass afterwards, so this walk lands on exactly the layouts it used to.
    return reds * 100 + overloaded;
  };

  let current = cost();
  if (current === 0) {
    return hexes;
  }
  let bestTokens = numbered.map((hex) => hex.numberToken);
  let bestCost = current;

  // A private generator seeded from the board itself. Restarts need randomness
  // to escape local minima, but drawing from the caller's source would both
  // consume its budget and couple generation cost to this repair pass, so the
  // stream is derived from the layout instead: same board, same repair.
  let state = numbered.reduce(
    (seed, hex) => (Math.imul(seed, 31) + (hex.numberToken ?? 0)) >>> 0,
    numbered.length >>> 0,
  );
  const nextInt = (bound: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % bound;
  };
  const applyTokens = (tokens: readonly (NumberTokenValue | null)[]): void => {
    for (const [position, hex] of numbered.entries()) {
      hex.numberToken = tokens[position] ?? hex.numberToken;
    }
  };

  const walkLength = Math.min(4_000, 30 * numbered.length * numbered.length);
  for (let restart = 0; restart < 10 && bestCost > 0; restart += 1) {
    if (restart > 0) {
      // Reshuffle the tokens among their hexes for a fresh starting point.
      const tokens = numbered.map((hex) => hex.numberToken);
      for (let index = tokens.length - 1; index > 0; index -= 1) {
        const swap = nextInt(index + 1);
        const carried = tokens[index] as NumberTokenValue | null;
        tokens[index] = tokens[swap] as NumberTokenValue | null;
        tokens[swap] = carried;
      }
      applyTokens(tokens);
      current = cost();
    }

    for (let step = 0; step < walkLength && current > 0; step += 1) {
      const left = numbered[nextInt(numbered.length)];
      const right = numbered[nextInt(numbered.length)];
      if (!left || !right || left === right) {
        continue;
      }
      const leftValue = left.numberToken;
      const rightValue = right.numberToken;
      if (leftValue === rightValue) {
        continue;
      }

      left.numberToken = rightValue;
      right.numberToken = leftValue;
      const next = cost();

      // Ties are accepted so the walk can cross plateaus where no single swap
      // helps but a pair of them does.
      if (next <= current) {
        current = next;
        if (next < bestCost) {
          bestCost = next;
          bestTokens = numbered.map((hex) => hex.numberToken);
        }
      } else {
        left.numberToken = leftValue;
        right.numberToken = rightValue;
      }
    }
  }

  applyTokens(bestTokens);
  return hexes;
}

function repairRedNumberAdjacency(
  source: BoardHex[],
  boundedInt: BoundedIntSource,
): BoardHex[] {
  const hexes = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
  }));
  const exact = findExactRedNumberPlacement(hexes);
  if (exact) {
    return exact;
  }
  const producing = hexes.filter((hex) => isProducingTerrain(hex.terrain));
  const hexByCoordinate = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );

  for (let move = 0; move < Math.min(64, producing.length); move += 1) {
    const redHexes = producing.filter(
      (hex) =>
        isRedNumber(hex.numberToken) &&
        neighbors(hex.coordinate).some((coordinate) =>
          isRedNumber(
            hexByCoordinate.get(coordinateKey(coordinate))?.numberToken ?? null,
          ),
        ),
    );
    if (redHexes.length === 0) {
      break;
    }
    const alternatives = fisherYates(
      producing.filter((hex) => !isRedNumber(hex.numberToken)),
      boundedInt,
    );
    let bestSwap: { left: BoardHex; right: BoardHex } | null = null;
    let bestDelta = 0;

    for (const left of redHexes) {
      for (const right of alternatives) {
        const leftValue = left.numberToken;
        const rightValue = right.numberToken;
        const before = affectedRedEdges(left, right, hexByCoordinate);
        left.numberToken = rightValue;
        right.numberToken = leftValue;
        const after = affectedRedEdges(left, right, hexByCoordinate);
        left.numberToken = leftValue;
        right.numberToken = rightValue;
        const delta = after - before;
        if (delta < bestDelta) {
          bestDelta = delta;
          bestSwap = { left, right };
        }
      }
    }

    if (!bestSwap) {
      break;
    }
    const value = bestSwap.left.numberToken;
    bestSwap.left.numberToken = bestSwap.right.numberToken;
    bestSwap.right.numberToken = value;
  }

  return hexes;
}

function findExactRedNumberPlacement(
  source: readonly BoardHex[],
): BoardHex[] | null {
  const producing = source.filter((hex) => isProducingTerrain(hex.terrain));
  const redValues = producing
    .map((hex) => hex.numberToken)
    .filter(isRedNumberValue);
  if (
    redValues.length < 2 ||
    !hasAdjacentRedNumbers(source) ||
    !combinationCountAtMost(producing.length, redValues.length, 100_000)
  ) {
    return null;
  }
  const otherValues = producing
    .map((hex) => hex.numberToken)
    .filter((value) => !isRedNumber(value));
  const producingKeys = producing.map((hex) => coordinateKey(hex.coordinate));
  const selected: number[] = [];
  let best: BoardHex[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  function visit(start: number): void {
    if (selected.length === redValues.length) {
      const selectedSet = new Set(selected);
      const selectedHexes = selected.map((index) => producing[index]);
      if (
        selectedHexes.some(
          (hex, index) =>
            hex !== undefined &&
            selectedHexes.some(
              (other, otherIndex) =>
                other !== undefined &&
                otherIndex > index &&
                areAdjacent(hex.coordinate, other.coordinate),
            ),
        )
      ) {
        return;
      }
      const candidate = source.map((hex) => ({
        ...hex,
        coordinate: { ...hex.coordinate },
      }));
      const byKey = new Map(
        candidate.map((hex) => [coordinateKey(hex.coordinate), hex]),
      );
      let redCursor = 0;
      let otherCursor = 0;
      for (let index = 0; index < producingKeys.length; index += 1) {
        const target = byKey.get(producingKeys[index] ?? "");
        if (!target) {
          continue;
        }
        target.numberToken = selectedSet.has(index)
          ? (redValues[redCursor++] ?? null)
          : (otherValues[otherCursor++] ?? null);
      }
      const score = numberPlacementScore(candidate);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
      return;
    }

    const remaining = redValues.length - selected.length;
    for (let index = start; index <= producing.length - remaining; index += 1) {
      selected.push(index);
      visit(index + 1);
      selected.pop();
    }
  }

  visit(0);
  return best;
}

function hasAdjacentRedNumbers(hexes: readonly BoardHex[]): boolean {
  const byKey = new Map(
    hexes.map((hex) => [coordinateKey(hex.coordinate), hex]),
  );
  return hexes.some(
    (hex) =>
      isRedNumber(hex.numberToken) &&
      neighbors(hex.coordinate).some((coordinate) =>
        isRedNumber(byKey.get(coordinateKey(coordinate))?.numberToken ?? null),
      ),
  );
}

function isRedNumberValue(
  value: NumberTokenValue | null,
): value is NumberTokenValue {
  return isRedNumber(value);
}

function isRedNumber(value: NumberTokenValue | null): boolean {
  return value === 6 || value === 8;
}

function affectedRedEdges(
  left: BoardHex,
  right: BoardHex,
  hexByCoordinate: ReadonlyMap<string, BoardHex>,
): number {
  const edges = new Set<string>();
  for (const hex of [left, right]) {
    const key = coordinateKey(hex.coordinate);
    for (const coordinate of neighbors(hex.coordinate)) {
      const other = hexByCoordinate.get(coordinateKey(coordinate));
      if (!other) {
        continue;
      }
      const otherKey = coordinateKey(other.coordinate);
      edges.add(key < otherKey ? `${key}|${otherKey}` : `${otherKey}|${key}`);
    }
  }

  let count = 0;
  for (const edge of edges) {
    const [leftKey, rightKey] = edge.split("|");
    const leftHex = leftKey ? hexByCoordinate.get(leftKey) : undefined;
    const rightHex = rightKey ? hexByCoordinate.get(rightKey) : undefined;
    if (
      leftHex &&
      rightHex &&
      isRedNumber(leftHex.numberToken) &&
      isRedNumber(rightHex.numberToken)
    ) {
      count += 1;
    }
  }
  return count;
}

function repairSmallIslands(source: readonly BoardHex[]): BoardHex[] {
  let hexes: BoardHex[] = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
    numberToken: null,
  }));
  const maximumMoves = hexes.filter((hex) => hex.terrain !== "sea").length;

  for (let move = 0; move < maximumMoves; move += 1) {
    const groups = connectedHexGroups(
      hexes,
      (hex) => hex.terrain !== "sea",
    ).sort((left, right) => right.length - left.length);
    const sourceGroup = [...groups].reverse().find((group) => group.length < 3);
    if (!sourceGroup) {
      return hexes;
    }
    const targetGroup = groups.find((group) => group !== sourceGroup);
    if (!targetGroup) {
      break;
    }

    const targetKeys = new Set(
      targetGroup.map((hex) => coordinateKey(hex.coordinate)),
    );
    const working = cloneTerrainLayout(hexes);
    let completed = true;
    for (const sourceHex of sourceGroup) {
      const workingSource = working.find(
        (hex) =>
          coordinateKey(hex.coordinate) === coordinateKey(sourceHex.coordinate),
      );
      const targetSea = working.find(
        (hex) =>
          hex.terrain === "sea" &&
          neighbors(hex.coordinate).some((coordinate) =>
            targetKeys.has(coordinateKey(coordinate)),
          ),
      );
      if (!targetSea || !workingSource) {
        completed = false;
        break;
      }
      targetSea.terrain = workingSource.terrain;
      workingSource.terrain = "sea";
      targetKeys.add(coordinateKey(targetSea.coordinate));
    }
    if (!completed) {
      break;
    }
    hexes = working;
  }

  return hexes;
}

function repairPortCapacity(
  source: readonly BoardHex[],
  requestedPortCount: number,
): BoardHex[] {
  let hexes: BoardHex[] = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
    numberToken: null,
  }));
  const seaCount = hexes.filter((hex) => hex.terrain === "sea").length;
  if (combinationCountAtMost(hexes.length, seaCount, 250_000)) {
    return findExactPortLayout(hexes, requestedPortCount);
  }
  hexes = findPortLayoutWithBeamSearch(hexes, requestedPortCount);
  if (availablePortEdgeCount(hexes) >= requestedPortCount) {
    return hexes;
  }
  const maximumMoves = Math.min(
    16,
    hexes.filter((hex) => hex.terrain === "sea").length,
  );

  for (let move = 0; move < maximumMoves; move += 1) {
    const currentEdges = availablePortEdgeCount(hexes);
    if (currentEdges >= requestedPortCount) {
      return hexes;
    }

    const seaHexes = hexes.filter((hex) => hex.terrain === "sea");
    const landHexes = hexes.filter((hex) => hex.terrain !== "sea");
    let bestSwap: { sea: BoardHex; land: BoardHex } | null = null;
    let bestEdges = currentEdges;

    for (const sea of seaHexes) {
      for (const land of landHexes) {
        const landTerrain = land.terrain;
        land.terrain = "sea";
        sea.terrain = landTerrain;
        const hasSmallIsland = connectedHexGroups(
          hexes,
          (hex) => hex.terrain !== "sea",
        ).some((group) => group.length < 3);
        const candidateEdges = hasSmallIsland
          ? currentEdges
          : availablePortEdgeCount(hexes);
        land.terrain = landTerrain;
        sea.terrain = "sea";
        if (candidateEdges > bestEdges) {
          bestEdges = candidateEdges;
          bestSwap = { sea, land };
          if (bestEdges >= requestedPortCount) {
            break;
          }
        }
      }
      if (bestEdges >= requestedPortCount) {
        break;
      }
    }

    if (!bestSwap) {
      break;
    }
    const landTerrain = bestSwap.land.terrain;
    bestSwap.land.terrain = "sea";
    bestSwap.sea.terrain = landTerrain;
  }

  return hexes;
}

function findPortLayoutWithBeamSearch(
  source: readonly BoardHex[],
  requestedPortCount: number,
): BoardHex[] {
  const beamWidth = 16;
  const maximumDepth = 4;
  let best = cloneTerrainLayout(source);
  let bestEdges = availablePortEdgeCount(best);
  let frontier = [best];
  const seen = new Set([terrainLayoutSignature(best)]);

  for (let depth = 0; depth < maximumDepth; depth += 1) {
    const candidates: Array<{ layout: BoardHex[]; edges: number }> = [];
    for (const layout of frontier) {
      const seaIndices = layout.flatMap((hex, index) =>
        hex.terrain === "sea" ? [index] : [],
      );
      const landIndices = layout.flatMap((hex, index) =>
        hex.terrain === "sea" ? [] : [index],
      );
      const pairs = seaIndices.flatMap((seaIndex) =>
        landIndices.map((landIndex) => ({ landIndex, seaIndex })),
      );
      const pairLimit = layout.length <= 40 ? pairs.length : 512;
      for (let pairIndex = 0; pairIndex < pairLimit; pairIndex += 1) {
        const pair = pairs[pairIndex];
        if (!pair) {
          continue;
        }
        const candidate = cloneTerrainLayout(layout);
        const sea = candidate[pair.seaIndex];
        const land = candidate[pair.landIndex];
        if (!sea || !land) {
          continue;
        }
        const landTerrain = land.terrain;
        land.terrain = "sea";
        sea.terrain = landTerrain;
        const signature = terrainLayoutSignature(candidate);
        if (seen.has(signature)) {
          continue;
        }
        seen.add(signature);
        if (
          connectedHexGroups(candidate, (hex) => hex.terrain !== "sea").some(
            (group) => group.length < 3,
          )
        ) {
          continue;
        }
        const edges = availablePortEdgeCount(candidate);
        if (edges > bestEdges) {
          best = candidate;
          bestEdges = edges;
        }
        if (edges >= requestedPortCount) {
          return candidate;
        }
        candidates.push({ layout: candidate, edges });
      }
    }
    candidates.sort((left, right) => right.edges - left.edges);
    frontier = candidates.slice(0, beamWidth).map(({ layout }) => layout);
    if (frontier.length === 0) {
      break;
    }
  }

  return best;
}

function cloneTerrainLayout(source: readonly BoardHex[]): BoardHex[] {
  return source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
    numberToken: null,
  }));
}

function terrainLayoutSignature(hexes: readonly BoardHex[]): string {
  return hexes
    .filter((hex) => hex.terrain === "sea")
    .map((hex) => coordinateKey(hex.coordinate))
    .sort()
    .join("|");
}

function combinationCountAtMost(
  itemCount: number,
  selectedCount: number,
  limit: number,
): boolean {
  const selection = Math.min(selectedCount, itemCount - selectedCount);
  let combinations = 1;
  for (let index = 1; index <= selection; index += 1) {
    combinations = (combinations * (itemCount - selection + index)) / index;
    if (combinations > limit) {
      return false;
    }
  }
  return true;
}

function findExactPortLayout(
  source: readonly BoardHex[],
  requestedPortCount: number,
): BoardHex[] {
  const seaCount = source.filter((hex) => hex.terrain === "sea").length;
  const landTerrains = source
    .filter((hex) => hex.terrain !== "sea")
    .map((hex) => hex.terrain);
  let best: BoardHex[] = source.map((hex) => ({
    ...hex,
    coordinate: { ...hex.coordinate },
    numberToken: null,
  }));
  let bestEdges = availablePortEdgeCount(best);
  const selected: number[] = [];

  function visit(start: number): boolean {
    if (selected.length === seaCount) {
      let landCursor = 0;
      const seaIndices = new Set(selected);
      const candidate: BoardHex[] = source.map((hex, index) => ({
        ...hex,
        coordinate: { ...hex.coordinate },
        terrain: seaIndices.has(index)
          ? "sea"
          : (landTerrains[landCursor++] ?? "desert"),
        numberToken: null,
      }));
      if (
        connectedHexGroups(candidate, (hex) => hex.terrain !== "sea").some(
          (group) => group.length < 3,
        )
      ) {
        return false;
      }
      const edges = availablePortEdgeCount(candidate);
      if (edges > bestEdges) {
        best = candidate;
        bestEdges = edges;
      }
      return edges >= requestedPortCount;
    }

    const remaining = seaCount - selected.length;
    for (let index = start; index <= source.length - remaining; index += 1) {
      selected.push(index);
      if (visit(index + 1)) {
        return true;
      }
      selected.pop();
    }
    return false;
  }

  visit(0);
  return best;
}

function assignTerrain(
  coordinates: readonly HexCoordinate[],
  terrain: readonly TerrainType[],
  numbers: readonly NumberTokenValue[],
  requestedPortCount: number,
  boundedInt: BoundedIntSource,
): BoardHex[] {
  const uniqueTerrainTypes = new Set(terrain).size;
  const attempts =
    uniqueTerrainTypes <= 1
      ? 1
      : Math.min(240, Math.max(80, coordinates.length * 3));
  let best: BoardHex[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shuffledTerrain = fisherYates(terrain, boundedInt);
    const hexes: BoardHex[] = coordinates.map((coordinate, index) => ({
      coordinate: { ...coordinate },
      terrain: shuffledTerrain[index] ?? "sea",
      numberToken: null,
    }));
    const score = terrainLayoutScore(hexes, requestedPortCount);
    if (score < bestScore) {
      best = hexes;
      bestScore = score;
      if (score === 0) {
        break;
      }
    }
  }

  if (!best) {
    return [];
  }
  const repairedIslands = connectedHexGroups(
    best,
    (hex) => hex.terrain !== "sea",
  ).some((group) => group.length < 3)
    ? repairSmallIslands(best)
    : best;
  const repairedPorts =
    availablePortEdgeCount(repairedIslands) < requestedPortCount
      ? repairPortCapacity(repairedIslands, requestedPortCount)
      : repairedIslands;
  return optimizeNumberTokens(repairedPorts, numbers, boundedInt);
}

function coastEdges(hexes: readonly BoardHex[]): CoastEdge[] {
  const center = hexes.reduce(
    (sum, hex) => ({
      q: sum.q + hex.coordinate.q / Math.max(1, hexes.length),
      r: sum.r + hex.coordinate.r / Math.max(1, hexes.length),
    }),
    { q: 0, r: 0 },
  );
  const edges: CoastEdge[] = [];
  for (const hex of hexes) {
    if (hex.terrain === "sea") {
      continue;
    }
    for (let direction = 0; direction < 6; direction += 1) {
      const typedDirection = direction as HexDirection;
      const seaCoordinate = neighbor(hex.coordinate, typedDirection);
      const sea = hexes.find(
        (candidate) =>
          coordinateKey(candidate.coordinate) === coordinateKey(seaCoordinate),
      );
      if (sea?.terrain !== "sea") {
        continue;
      }
      const midpoint = {
        q: (hex.coordinate.q + seaCoordinate.q) / 2,
        r: (hex.coordinate.r + seaCoordinate.r) / 2,
      };
      const x = 1.5 * (midpoint.q - center.q);
      const y =
        Math.sqrt(3) * (midpoint.r - center.r + (midpoint.q - center.q) / 2);
      edges.push({
        landCoordinate: { ...hex.coordinate },
        direction: typedDirection,
        angle: Math.atan2(y, x),
      });
    }
  }
  return edges;
}

function angularDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % (Math.PI * 2);
  return Math.min(difference, Math.PI * 2 - difference);
}

function placePorts(
  hexes: readonly BoardHex[],
  portTypes: readonly PortType[],
  boundedInt: BoundedIntSource,
): BoardPort[] {
  const available = coastEdges(hexes);
  const count = Math.min(available.length, portTypes.length);
  if (count === 0) {
    return [];
  }
  const selected: CoastEdge[] = [];
  const first = available.splice(boundedInt(available.length), 1)[0];
  if (first) {
    selected.push(first);
  }
  while (selected.length < count && available.length > 0) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < available.length; index += 1) {
      const candidate = available[index];
      if (!candidate) {
        continue;
      }
      const distance = Math.min(
        ...selected.map((edge) => angularDistance(candidate.angle, edge.angle)),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const [edge] = available.splice(bestIndex, 1);
    if (edge) {
      selected.push(edge);
    }
  }

  const shuffledTypes = fisherYates(portTypes, boundedInt);
  return selected.map((edge, index) => ({
    landCoordinate: { ...edge.landCoordinate },
    direction: edge.direction,
    type: shuffledTypes[index] ?? "generic",
  }));
}

export function generateBoardLayout(
  inventory: BoardInventory,
  source: RandomSource | BoundedIntSource,
  footprint: readonly HexCoordinate[] = [],
): BoardMutationResult<GeneratedBoardLayout> {
  const hexCount = totalTerrain(inventory);
  if (hexCount <= 0) {
    return generationFailure("Add at least one terrain or sea hex first.");
  }
  if (hexCount > MAX_BOARD_HEXES) {
    return generationFailure(
      `A design can contain at most ${MAX_BOARD_HEXES} hexes.`,
    );
  }

  const boundedInt = toBoundedInt(source);
  const allTerrain = expandTerrain(inventory);
  const landCount = hexCount - inventory.terrain.sea;
  if (landCount > 0 && landCount < 3) {
    return generationFailure(
      "Generated islands require at least three land hexes.",
    );
  }
  const portTypes = expandPorts(inventory);
  if (
    footprint.length !== hexCount ||
    new Set(footprint.map(coordinateKey)).size !== footprint.length ||
    !isSymmetricFootprint(footprint) ||
    !isConnected(
      footprint.map((coordinate) => ({
        coordinate,
        terrain: "sea",
        numberToken: null,
      })),
    )
  ) {
    return generationFailure(
      "Create a connected 180-degree symmetric border that matches the tile count before generating.",
    );
  }
  const footprintCoordinates = footprint.map((coordinate) => ({
    ...coordinate,
  }));
  const hexes = assignTerrain(
    footprintCoordinates,
    allTerrain,
    expandNumbers(inventory),
    portTypes.length,
    boundedInt,
  );
  if (
    connectedHexGroups(hexes, (hex) => hex.terrain !== "sea").some(
      (group) => group.length < 3,
    )
  ) {
    return generationFailure(
      "The selected inventory could not form islands of at least three land hexes.",
    );
  }
  const ports = placePorts(hexes, portTypes, boundedInt);
  if (ports.length !== portTypes.length) {
    return generationFailure(
      "The selected border could not fit every requested port.",
    );
  }

  const coordinateKeys = new Set(
    hexes.map((hex) => coordinateKey(hex.coordinate)),
  );
  const portKeys = new Set(
    ports.map((port) => edgeKey(port.landCoordinate, port.direction)),
  );
  if (coordinateKeys.size !== hexes.length || portKeys.size !== ports.length) {
    return generationFailure("The generator produced a duplicate position.");
  }

  return { ok: true, value: { hexes, ports } };
}
