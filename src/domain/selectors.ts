import type {
  GameState,
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
