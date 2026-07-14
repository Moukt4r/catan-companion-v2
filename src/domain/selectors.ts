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
  if (clock === undefined) {
    return 0;
  }
  return clock.totalActiveMs + liveClockMilliseconds(clock.runningSince, at);
}

export function currentTurnActiveMilliseconds(
  state: Pick<GameState, "clock">,
  at: IsoTimestamp,
): number {
  const clock = state.clock;
  if (clock === undefined) {
    return 0;
  }
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
  if (clock === undefined) {
    return 0;
  }
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
