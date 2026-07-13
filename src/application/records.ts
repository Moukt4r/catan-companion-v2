import { currentPlayer, scoreForPlayer } from "../domain";
import type { GameState } from "../domain";
import type { StoredGame } from "./persistence";

export function storedGameFromState(
  state: GameState,
  lifecycle: StoredGame["lifecycle"] = state.status,
): StoredGame {
  const player = currentPlayer(state);
  return {
    id: state.id,
    lifecycle,
    title: state.setup.title,
    headRevisionId: state.revisionId,
    latestRevisionId: state.revisionId,
    redoStack: [],
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    ...(state.status === "completed" ? { completedAt: state.updatedAt } : {}),
    ...(state.winnerId === null ? {} : { winnerId: state.winnerId }),
    players: state.players.map((entry) => ({
      id: entry.id,
      name: entry.name,
      colorHex: entry.color.hex,
      score: scoreForPlayer(state, entry.id),
    })),
    currentTurn: {
      playerId: player.id,
      playerName: player.name,
      round: state.turn.round,
      turnNumber: state.turn.turnNumber,
      phase: state.turn.phase,
    },
    gameDocumentVersion: state.setup.gameDocumentVersion,
    rulesDataVersion: state.setup.rulesDataVersion,
  };
}
