import { elapsedActiveMilliseconds } from "./clock";
import type {
  GameClockState,
  GameState,
  IsoTimestamp,
  MetropolisDiscipline,
  PlayerId,
  PlayerState,
} from "./types";

export function scoreForPlayer(
  state: Pick<GameState, "scoreLedger">,
  playerId: PlayerId,
): number {
  return state.scoreLedger
    .filter((entry) => entry.playerId === playerId)
    .reduce((total, entry) => total + entry.delta, 0);
}

export function metropolisCountForPlayer(
  state: Pick<GameState, "metropolises">,
  playerId: PlayerId,
): number {
  return Object.values(state.metropolises.controls).filter(
    (control) => control?.holderId === playerId,
  ).length;
}

export function activeKnightStrength(
  player: Pick<PlayerState, "activeKnights">,
): number {
  return (
    player.activeKnights.basic +
    2 * player.activeKnights.strong +
    3 * player.activeKnights.mighty
  );
}

/** Total knights a player owns on the board, activated or not. */
export function knightCount(
  player: Pick<PlayerState, "activeKnights" | "inactiveKnights">,
): number {
  const counts = [player.activeKnights, player.inactiveKnights];
  return counts.reduce(
    (total, knights) => total + knights.basic + knights.strong + knights.mighty,
    0,
  );
}

/**
 * Defence a player could contribute if every knight were activated.
 *
 * Inactive knights hold board positions but never defend, so the gap between
 * this and {@link activeKnightStrength} is exactly what a player gives up by
 * leaving knights inactive when the barbarians arrive.
 */
export function potentialKnightStrength(
  player: Pick<PlayerState, "activeKnights" | "inactiveKnights">,
): number {
  return (
    activeKnightStrength(player) +
    player.inactiveKnights.basic +
    2 * player.inactiveKnights.strong +
    3 * player.inactiveKnights.mighty
  );
}

/** Base cards a player may hold at a 7 before any city walls are counted. */
export const BASE_SAFE_HAND_LIMIT = 7;

/** Extra safe cards granted by each city wall. */
export const HAND_LIMIT_PER_CITY_WALL = 2;

/**
 * Cards a player may keep on a 7. Each city wall raises the limit by two, so
 * this is the number the table actually needs when discarding.
 */
export function safeHandLimit(player: Pick<PlayerState, "cityWalls">): number {
  return BASE_SAFE_HAND_LIMIT + HAND_LIMIT_PER_CITY_WALL * player.cityWalls;
}

/** Cards discarded on a 7: everything above the limit, halved and rounded down. */
export function discardCount(
  player: Pick<PlayerState, "cityWalls">,
  handSize: number,
): number {
  const limit = safeHandLimit(player);
  return handSize <= limit ? 0 : Math.floor(handSize / 2);
}

export function barbarianStrength(
  state: Pick<GameState, "players" | "metropolises">,
): number {
  const ordinaryCities = state.players.reduce(
    (total, player) => total + player.ordinaryCities,
    0,
  );
  const metropolises = (
    Object.keys(state.metropolises.controls) as MetropolisDiscipline[]
  ).filter(
    (discipline) => state.metropolises.controls[discipline] !== null,
  ).length;
  return ordinaryCities + metropolises;
}

export function defenderStrength(state: Pick<GameState, "players">): number {
  return state.players.reduce(
    (total, player) => total + activeKnightStrength(player),
    0,
  );
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.turn.currentPlayerIndex] as PlayerState;
}

export function winnerCandidates(state: GameState): PlayerId[] {
  return state.players
    .filter(
      (player) => scoreForPlayer(state, player.id) >= state.setup.victoryTarget,
    )
    .map((player) => player.id);
}

export function totalActiveMilliseconds(
  state: Pick<GameState, "clock">,
  at: IsoTimestamp,
): number {
  const clock = state.clock;
  return clock.totalActiveMs + liveClockMilliseconds(clock.runningSince, at);
}

export function currentTurnActiveMilliseconds(
  state: Pick<GameState, "clock">,
  at: IsoTimestamp,
): number {
  const clock = state.clock;
  return (
    clock.currentTurnActiveMs + liveClockMilliseconds(clock.runningSince, at)
  );
}

export function playerActiveMilliseconds(
  state: Pick<GameState, "clock" | "players" | "turn">,
  playerId: PlayerId,
  at: IsoTimestamp,
): number {
  const clock = state.clock;
  const settled = clock.playerActiveMs[playerId] ?? 0;
  const currentPlayer = state.players[state.turn.currentPlayerIndex];
  return (
    settled +
    (currentPlayer?.id === playerId
      ? liveClockMilliseconds(clock.runningSince, at)
      : 0)
  );
}

function liveClockMilliseconds(
  runningSince: GameClockState["runningSince"],
  at: IsoTimestamp,
): number {
  if (runningSince === null) {
    return 0;
  }
  return elapsedActiveMilliseconds(runningSince, at) ?? 0;
}
