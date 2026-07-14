import {
  PROGRESS_ELIGIBILITY_2025,
  activeKnightStrength,
  barbarianStrength,
  currentPlayer,
  defenderStrength,
  metropolisCountForPlayer,
  scoreForPlayer,
  winnerCandidates,
  type BarbarianAttackProposal,
  type GamePhase,
  type GameState,
  type PlayerId,
  type ProgressDiscipline,
} from "../../../domain";
import type { GameCompleteView } from "./GameCompleteScreen";
import type { GameTableView } from "./GameTable";
import type { PlayerEditorValue } from "./PlayerEditorDialog";
import type {
  BarbarianAttackView,
  ProgressEligiblePlayer,
  RollResolutionView,
} from "./RollResolutionDialog";

const phaseLabels: Record<GamePhase, string> = {
  "action-phase": "Action phase",
  "awaiting-roll": "Awaiting roll",
  completed: "Completed",
  "resolving-barbarian-attack": "Resolving barbarian attack",
  "resolving-official-result": "Resolving official result",
  "resolving-thematic-event": "Resolving house event",
  "turn-complete": "Turn complete",
};

export function toGameTableView(
  state: GameState,
  save: Pick<GameTableView, "savedLabel" | "saveTone">,
  offline = false,
  rolling = false,
  readOnly = false,
): GameTableView {
  const active = currentPlayer(state);
  const candidates = winnerCandidates(state);
  const candidate = candidates[0]
    ? state.players.find((player) => player.id === candidates[0])
    : undefined;

  return {
    title: state.setup.title,
    phaseLabel: phaseLabels[state.turn.phase],
    currentPlayerName: active.name,
    currentPlayerColor: active.color.hex,
    round: state.turn.round,
    turnNumber: state.turn.turnNumber,
    savedLabel: save.savedLabel,
    saveTone: save.saveTone,
    offline,
    readOnly,
    canRoll: state.turn.phase === "awaiting-roll",
    canEndTurn:
      state.turn.phase === "action-phase" &&
      state.metropolises.pendingProposal === null,
    rolling,
    lastRoll: state.lastRoll
      ? {
          red: state.lastRoll.numbered.red,
          yellow: state.lastRoll.numbered.yellow,
          event: state.lastRoll.eventFace,
          total: state.lastRoll.total,
          source: state.lastRoll.alchemy ? "alchemy" : "balanced",
        }
      : null,
    numberedCycleProgress: `${state.numberedDeck.cursor} / ${state.numberedDeck.order.length}`,
    barbarian: {
      position: state.barbarian.shipPosition,
      trackLength: state.barbarian.rules.trackLength,
      strength: barbarianStrength(state),
      defenderStrength: defenderStrength(state),
    },
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color.hex,
      victoryPoints: scoreForPlayer(state, player.id),
      ordinaryCities: player.ordinaryCities,
      metropolisDisciplines: Object.entries(state.metropolises.controls)
        .filter(([, control]) => control?.holderId === player.id)
        .map(([discipline]) => discipline),
      activeKnightStrength: activeKnightStrength(player),
      improvements: {
        ...player.improvements,
      },
      current: player.id === active.id,
    })),
    houseEventPending: state.thematicEvents.pendingEvent !== null,
    winnerCandidateName: candidate?.name ?? null,
  };
}

export function toPlayerEditorValue(
  state: GameState,
  playerId: PlayerId,
): PlayerEditorValue {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error("Player does not exist.");
  }

  return {
    id: player.id,
    name: player.name,
    color: player.color.hex,
    victoryPoints: scoreForPlayer(state, player.id),
    ordinaryCities: player.ordinaryCities,
    activeKnights: {
      ...player.activeKnights,
    },
    improvements: {
      ...player.improvements,
    },
    metropolisDisciplines: Object.entries(state.metropolises.controls)
      .filter(([, control]) => control?.holderId === player.id)
      .map(([discipline]) => discipline),
  };
}

export function toEligibleProgressPlayers(
  state: GameState,
  discipline: ProgressDiscipline,
): ProgressEligiblePlayer[] {
  const eligibleIds = state.lastRoll?.progress?.eligiblePlayerIds ?? [];

  return eligibleIds.flatMap((playerId) => {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return [];
    }

    const level = player.improvements[discipline];
    const range = PROGRESS_ELIGIBILITY_2025[level];
    return [
      {
        id: player.id,
        name: player.name,
        color: player.color.hex,
        level,
        eligibleRange: range.join(", "),
      },
    ];
  });
}

export function toRollResolutionView(state: GameState): RollResolutionView {
  const roll = state.lastRoll;
  if (!roll) {
    throw new Error("A roll result is required.");
  }
  const roller = state.players.find((player) => player.id === roll.playerId);
  if (!roller) {
    throw new Error("The rolling player does not exist.");
  }
  const nextPlayer =
    state.players[(roller.order + 1) % state.players.length] ?? roller;

  return {
    currentPlayerName: roller.name,
    nextPlayerName: nextPlayer.name,
    roll: {
      red: roll.numbered.red,
      yellow: roll.numbered.yellow,
      total: roll.total,
      event: roll.eventFace,
      source: roll.alchemy ? "alchemy" : "balanced",
    },
    progress: roll.progress
      ? {
          discipline: roll.progress.discipline,
          redValue: roll.progress.red,
          eligiblePlayers: toEligibleProgressPlayers(
            state,
            roll.progress.discipline,
          ),
        }
      : null,
    production: {
      total: roll.total,
      robberActivated: state.barbarian.robberActivated,
    },
    barbarian: {
      position: state.barbarian.shipPosition,
      trackLength: state.barbarian.rules.trackLength,
    },
    attack: state.barbarian.pendingAttack
      ? toBarbarianAttackView(state, state.barbarian.pendingAttack)
      : null,
    thematicEvent: state.thematicEvents.pendingEvent
      ? {
          title: state.thematicEvents.pendingEvent.title,
          instruction: state.thematicEvents.pendingEvent.instruction,
        }
      : null,
  };
}

export function toBarbarianAttackView(
  state: GameState,
  proposal: BarbarianAttackProposal,
): BarbarianAttackView {
  const outcome = proposal.outcome;
  const reward = outcome.type === "defenders-win" ? outcome.reward : null;

  return {
    proposalId: proposal.id,
    barbarianStrength: proposal.strengths.barbarian,
    defenderStrength: proposal.strengths.defenders,
    outcome: outcome.type,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color.hex,
      ordinaryCities: player.ordinaryCities,
      metropolises: metropolisCountForPlayer(state, player.id),
      activeKnights: describeActiveKnights(player.activeKnights),
      activeStrength: activeKnightStrength(player),
    })),
    uniqueDefenderId:
      reward?.type === "defender-point" ? reward.playerId : null,
    tiedDefenderIds: reward?.type === "progress-choice" ? reward.playerIds : [],
    pillagedPlayerIds:
      outcome.type === "barbarians-win" ? outcome.pillagedPlayerIds : [],
    firstAttack: proposal.firstAttack,
  };
}

export function toGameCompleteView(state: GameState): GameCompleteView {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) {
    throw new Error("Completed game has no winner.");
  }
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(state.updatedAt).getTime() -
        new Date(state.createdAt).getTime()) /
        60_000,
    ),
  );

  return {
    title: state.setup.title,
    winnerName: winner.name,
    winnerColor: winner.color.hex,
    completedAt: state.updatedAt,
    rounds: state.turn.round,
    turns: state.statistics.completedTurns,
    durationMinutes,
    rolls: state.statistics.totalRolls,
    barbarianAttacks: state.barbarian.attacksCompleted,
    thematicEvents: state.statistics.thematicEventsTriggered,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color.hex,
      victoryPoints: scoreForPlayer(state, player.id),
    })),
  };
}

function describeActiveKnights(
  counts: GameState["players"][number]["activeKnights"],
): string {
  const parts = [
    counts.basic > 0 ? `${counts.basic} basic` : null,
    counts.strong > 0 ? `${counts.strong} strong` : null,
    counts.mighty > 0 ? `${counts.mighty} mighty` : null,
  ].filter((part): part is string => part !== null);

  return parts.join(", ");
}
