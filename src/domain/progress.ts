import { PROGRESS_ELIGIBILITY_2025 } from "./rules";
import type {
  DieValue,
  GameState,
  ImprovementLevel,
  PlayerId,
  PlayerState,
  ProgressDiscipline,
} from "./types";

export function isProgressEligible(
  level: ImprovementLevel,
  red: DieValue,
): boolean {
  return PROGRESS_ELIGIBILITY_2025[level].includes(red);
}

export function playersInCurrentTurnOrder(
  players: readonly PlayerState[],
  currentPlayerIndex: number,
): PlayerState[] {
  return players.map(
    (_, offset) =>
      players[(currentPlayerIndex + offset) % players.length] as PlayerState,
  );
}

export function eligiblePlayersForProgress(
  state: Pick<GameState, "players" | "turn">,
  discipline: ProgressDiscipline,
  red: DieValue,
): PlayerId[] {
  return playersInCurrentTurnOrder(state.players, state.turn.currentPlayerIndex)
    .filter((player) =>
      isProgressEligible(player.improvements[discipline], red),
    )
    .map((player) => player.id);
}
