import type { StoredGame, StoredRevision } from "../application";
import {
  BUILT_IN_THEMATIC_EVENTS,
  asPlayerId,
  type GameSetup,
} from "../domain";
import type { CompletedGameSummary } from "../ui/features/home/CompletedGamesDialog";
import type { HomeGameSummary } from "../ui/features/home/HomeScreen";
import type { ImportPreview } from "../ui/features/home/ImportPreviewDialog";
import type { HistoryEntryView } from "../ui/features/game/HistoryDialog";
import type { MetropolisProposalView } from "../ui/features/game/MetropolisDialog";
import type { SetupDraft } from "../ui/features/setup/SetupWizard";
import type { gameController } from "./gameController";

export const colorNames: Record<string, string> = {
  "#b66a1f": "Amber",
  "#286b9b": "Ocean blue",
  "#b43e3e": "Crimson",
  "#2f7551": "Forest green",
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

export function setupFromDraft(draft: SetupDraft): GameSetup {
  const ids = new Map(
    draft.players.map((player) => [
      player.draftId,
      asPlayerId(crypto.randomUUID()),
    ]),
  );
  const firstPlayerId = ids.get(draft.firstPlayerDraftId);
  if (!firstPlayerId) {
    throw new Error("First player is missing from setup.");
  }

  const worldEventsEnabled = draft.eventCadence !== "off";
  const cadence =
    draft.eventCadence === "off" ? "standard" : draft.eventCadence;
  const selectedPacks = new Set(draft.worldEventPacks);
  const catalog = worldEventsEnabled
    ? BUILT_IN_THEMATIC_EVENTS.filter(
        (event) =>
          event.category !== undefined &&
          selectedPacks.has(event.category) &&
          (!draft.twoPlayerHouseMode ||
            event.compatibility?.twoPlayer !== false),
      ).map((event) => ({ ...event }))
    : [];

  return {
    title: draft.title,
    mode: draft.twoPlayerHouseMode ? "two-player-house-rule" : "standard",
    players: draft.players.map((player) => {
      const id = ids.get(player.draftId);
      if (!id) {
        throw new Error("Player setup ID is missing.");
      }
      const colorLabel = colorNames[player.color] ?? player.color;
      return {
        id,
        name: player.name.trim(),
        color: {
          id: colorLabel.toLocaleLowerCase().replaceAll(/\s+/g, "-"),
          label: colorLabel,
          hex: player.color,
          distinguishabilityKey: player.color,
        },
      };
    }),
    firstPlayerId,
    victoryTarget: draft.victoryTarget,
    thematicCadence: cadence,
    thematicEventsEnabled: worldEventsEnabled,
    thematicEventCatalog: catalog,
    ...(worldEventsEnabled && draft.seasonConfig?.enabled
      ? { seasonConfig: draft.seasonConfig }
      : {}),
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 2,
  };
}

export function toHomeSummary(game: StoredGame): HomeGameSummary {
  const player =
    game.players.find(
      (candidate) => candidate.id === game.currentTurn.playerId,
    ) ?? game.players[0];
  return {
    id: game.id,
    title: game.title,
    currentPlayerName: game.currentTurn.playerName,
    currentPlayerColor: player?.colorHex ?? "#286b9b",
    round: game.currentTurn.round,
    updatedAt: game.updatedAt,
    players: game.players.map((entry) => entry.name),
  };
}

export function toSavedGameSummary(game: StoredGame): CompletedGameSummary {
  const winner = game.winnerId
    ? game.players.find((player) => player.id === game.winnerId)
    : undefined;
  const current =
    game.players.find((player) => player.id === game.currentTurn.playerId) ??
    game.players[0];
  return {
    id: game.id,
    title: game.title,
    status: game.lifecycle === "completed" ? "completed" : "archived",
    currentPlayerName: game.currentTurn.playerName,
    currentPlayerColor: current?.colorHex ?? "#286b9b",
    updatedAt: game.updatedAt,
    rounds: game.currentTurn.round,
    turns: Math.max(0, game.currentTurn.turnNumber - 1),
    playerNames: game.players.map((player) => player.name),
    ...(winner
      ? {
          winnerName: winner.name,
          winnerColor: winner.colorHex,
        }
      : {}),
  };
}

export function toImportPreview(
  preview: ReturnType<typeof gameController.getSnapshot>["importPreview"],
): ImportPreview | null {
  if (!preview) {
    return null;
  }
  return {
    title: preview.title,
    players: preview.playerNames,
    turns: preview.completedTurns,
    updatedAt: preview.updatedAt,
    sourceVersion: preview.sourceApplicationVersion,
    status: "Validated backup",
  };
}

export function toHistoryEntries(
  revisions: StoredRevision[],
  activeRevisionId: string | null,
): HistoryEntryView[] {
  return revisions.map((revision) => {
    const playerId = revision.summary.playerIds[0];
    const player = playerId
      ? revision.state.players.find((candidate) => candidate.id === playerId)
      : undefined;
    return {
      id: revision.id,
      sequence: revision.sequence,
      createdAt: revision.createdAt,
      playerName: player?.name ?? null,
      title: historyTitle(revision),
      detail: revision.summary.text,
      houseRule:
        revision.summary.kind === "roll-drawn" ||
        revision.summary.kind === "alchemy-used" ||
        revision.summary.kind === "thematic-event-acknowledged" ||
        revision.summary.kind === "thematic-event-resolved",
      active: revision.id === activeRevisionId,
    };
  });
}

export function historyTitle(revision: StoredRevision): string {
  const titles: Record<StoredRevision["summary"]["kind"], string> = {
    "alchemy-used": "Alchemy roll",
    "attack-confirmed": "Barbarian attack",
    "clock-paused": "Game paused",
    "clock-resumed": "Game resumed",
    "clock-started": "Game timer started",
    "game-completed": "Game completed",
    "game-created": "Game created",
    "metropolis-cancelled": "Metropolis cancelled",
    "metropolis-confirmed": "Metropolis confirmed",
    "metropolis-proposed": "Metropolis proposed",
    "player-adjusted": "Public state updated",
    "resolution-acknowledged": "Resolution acknowledged",
    "roll-drawn": "Balanced roll",
    "thematic-event-acknowledged": "World event",
    "thematic-event-resolved": "World event resolved",
    "turn-ended": "Turn ended",
  };
  return titles[revision.summary.kind];
}

type ActiveState = NonNullable<
  ReturnType<typeof gameController.getSnapshot>["activeState"]
>;

type PendingProposal = NonNullable<
  ActiveState["metropolises"]["pendingProposal"]
>;

export function toMetropolisProposalView(
  state: ActiveState,
  proposal: PendingProposal,
): MetropolisProposalView {
  const next = proposal.to
    ? state.players.find((player) => player.id === proposal.to?.holderId)
    : null;
  const previous =
    proposal.from && proposal.from.holderId !== proposal.to?.holderId
      ? state.players.find((player) => player.id === proposal.from?.holderId)
      : null;
  return {
    discipline: proposal.discipline,
    nextHolder: next
      ? {
          id: next.id,
          name: next.name,
          color: next.color.hex,
        }
      : null,
    previousHolder: previous
      ? {
          id: previous.id,
          name: previous.name,
          color: previous.color.hex,
        }
      : null,
    status: proposal.to?.status ?? null,
  };
}
