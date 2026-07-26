import { elapsedActiveMilliseconds } from "./clock";
import type {
  GameClockState,
  GameState,
  IsoTimestamp,
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
