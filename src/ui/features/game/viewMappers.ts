import {
  PROGRESS_ELIGIBILITY_2025,
  currentPlayer,
  currentTurnActiveMilliseconds,
  playerActiveMilliseconds,
  scoreForPlayer,
  totalActiveMilliseconds,
  winnerCandidates,
  WORLD_EVENTS_CATALOG,
  lookupWorldEvent,
  worldEventTurnsRemaining,
  deriveSeason,
  isSeasonTransition,
  SEASON_LABELS,
  SEASON_ICONS,
  type GamePhase,
  type GameState,
  type IsoTimestamp,
  type ProgressDiscipline,
  type ActiveWorldEventRecord,
  type WorldEventCategory,
  type WorldEventDuration,
  type WorldEventTone,
} from "../../../domain";
import type { GameCompleteView } from "./GameCompleteScreen";
import type { GameTableView } from "./GameTable";
import type {
  ProgressEligiblePlayer,
  RollResolutionView,
} from "./RollResolutionDialog";
import type {
  WorldEventGuideEntry,
  WorldEventGuideView,
} from "./worldEventGuide";

const phaseLabels: Record<GamePhase, string> = {
  "action-phase": "Action phase",
  "awaiting-roll": "Awaiting roll",
  completed: "Completed",
  "resolving-official-result": "Resolving official result",
  "resolving-thematic-event": "Resolving world event",
  "turn-complete": "Turn complete",
};

export interface ActiveEventView {
  occurrenceId: string;
  eventId: string;
  title: string;
  instruction: string;
  tone: WorldEventTone;
  impact: number;
  category: WorldEventCategory;
  duration: WorldEventDuration;
  timingCopy: string;
  /** Turns still to play under a full-round event; null when not counted. */
  turnsRemaining: number | null;
  canResolve: boolean;
}

export interface PendingWorldEventView {
  eventId: string;
  title: string;
  instruction: string;
  tone: WorldEventTone;
  toneLabel: string;
  impact: number;
  category: WorldEventCategory;
  duration: WorldEventDuration;
  timingCopy: string;
}

function timingCopyForDuration(duration: WorldEventDuration): string {
  switch (duration) {
    case "immediate":
      return "Resolve now, then it is done";
    case "rest-of-turn":
      return "In force for the rest of this turn";
    case "full-round":
      return "In force for this full round";
    case "until-next-occurrence":
      return "In force until the next world event";
    case "until-resolved":
      return "In force until someone marks it resolved";
  }
}

function toneLabel(tone: WorldEventTone): string {
  return tone.charAt(0).toUpperCase() + tone.slice(1);
}

/**
 * Every event that can still come up in this game.
 *
 * The catalog is filtered by category pack at setup, so this reads the game's
 * own `enabledEvents` rather than the full built-in list. The deck draws each
 * event once per cycle, so anything before the cursor has already been seen
 * this year and anything after it is still to come.
 */
export function toWorldEventGuideView(state: GameState): WorldEventGuideView {
  const thematic = state.thematicEvents;
  const deck = thematic.eventDeck;
  const drawnIds = new Set(deck.order.slice(0, deck.cursor));

  const entries: WorldEventGuideEntry[] = thematic.enabledEvents.map(
    (event) => {
      const definition = lookupWorldEvent(WORLD_EVENTS_CATALOG, event.id);
      const tone = event.tone ?? definition?.tone ?? "mixed";
      const duration = event.duration ?? definition?.duration ?? "immediate";
      return {
        id: event.id,
        title: event.title,
        instruction: event.instruction,
        tone,
        toneLabel: toneLabel(tone),
        impact: event.impact ?? definition?.impact ?? 1,
        category: event.category ?? definition?.category ?? "society",
        duration,
        timingCopy: timingCopyForDuration(duration),
        drawn: drawnIds.has(event.id),
      };
    },
  );

  return {
    enabled: thematic.enabled,
    totalCount: entries.length,
    entries,
    deck: {
      percent: thematic.percent,
      cycle: deck.cycle,
      drawnCount: entries.filter((entry) => entry.drawn).length,
    },
  };
}

/**
 * The full built-in catalog, for browsing outside a game.
 *
 * No deck exists yet, so nothing is marked as drawn and there is no trigger
 * chance to report. This is the reference list rather than a report on any
 * particular table.
 */
export function toWorldEventCatalogView(): WorldEventGuideView {
  const entries: WorldEventGuideEntry[] = WORLD_EVENTS_CATALOG.map((event) => ({
    id: event.id,
    title: event.title,
    instruction: event.instruction,
    tone: event.tone,
    toneLabel: toneLabel(event.tone),
    impact: event.impact,
    category: event.category,
    duration: event.duration,
    timingCopy: timingCopyForDuration(event.duration),
    drawn: false,
  }));

  return {
    enabled: true,
    totalCount: entries.length,
    entries,
    deck: null,
  };
}

function toActiveEventViews(
  activeEvents: readonly ActiveWorldEventRecord[] | undefined,
  pendingOccurrenceId: string | null,
  phase: GamePhase,
  completedTurns: number,
  playerCount: number,
): ActiveEventView[] {
  if (!activeEvents || activeEvents.length === 0) return [];
  return [...activeEvents]
    .filter((event) => event.occurrenceId !== pendingOccurrenceId)
    .sort((a, b) => b.triggeredAtCompletedTurn - a.triggeredAtCompletedTurn)
    .map((event) => ({
      occurrenceId: event.occurrenceId,
      eventId: event.eventId,
      title: event.title,
      instruction: event.instruction,
      tone: event.tone,
      impact: event.impact,
      category: event.category,
      duration: event.duration,
      timingCopy: timingCopyForDuration(event.duration),
      turnsRemaining: worldEventTurnsRemaining(
        event,
        completedTurns,
        playerCount,
      ),
      // The domain only accepts `event.resolved` during the action phase, so
      // offering the control outside it would surface an avoidable error.
      canResolve:
        event.duration === "until-resolved" && phase === "action-phase",
    }));
}

function toPendingWorldEventView(
  pendingEvent: GameState["thematicEvents"]["pendingEvent"],
): PendingWorldEventView | null {
  if (!pendingEvent) return null;
  const worldDef = lookupWorldEvent(WORLD_EVENTS_CATALOG, pendingEvent.eventId);
  const tone = pendingEvent.tone ?? worldDef?.tone ?? "mixed";
  const duration = pendingEvent.duration ?? worldDef?.duration ?? "immediate";
  return {
    eventId: pendingEvent.eventId,
    title: pendingEvent.title,
    instruction: pendingEvent.instruction,
    tone,
    toneLabel: tone.charAt(0).toUpperCase() + tone.slice(1),
    impact: pendingEvent.impact ?? worldDef?.impact ?? 1,
    category: pendingEvent.category ?? worldDef?.category ?? "society",
    duration,
    timingCopy: timingCopyForDuration(duration),
  };
}

export function toGameTableView(
  state: GameState,
  save: Pick<GameTableView, "savedLabel" | "saveTone">,
  offline = false,
  rolling = false,
  readOnly = false,
  clockAt: IsoTimestamp = state.updatedAt,
): GameTableView {
  const active = currentPlayer(state);
  const nextPlayer =
    state.players[(state.turn.currentPlayerIndex + 1) % state.players.length] ??
    active;
  const candidates = winnerCandidates(state);
  const candidate = candidates[0]
    ? state.players.find((player) => player.id === candidates[0])
    : undefined;

  return {
    title: state.setup.title,
    phaseLabel: phaseLabels[state.turn.phase],
    currentPlayerName: active.name,
    currentPlayerColor: active.color.hex,
    nextPlayerName: nextPlayer.name,
    round: state.turn.round,
    turnNumber: state.turn.turnNumber,
    savedLabel: save.savedLabel,
    saveTone: save.saveTone,
    offline,
    readOnly,
    paused:
      state.clock?.pausedAt !== null && state.clock?.pausedAt !== undefined,
    canRoll: state.turn.phase === "awaiting-roll",
    canContinueRoll: state.turn.phase === "resolving-official-result",
    showNextRoll: state.turn.phase === "action-phase",
    canRollNextTurn:
      state.turn.phase === "action-phase" &&
      state.metropolises.pendingProposal === null,
    canEditPublicState:
      state.turn.phase === "action-phase" &&
      state.metropolises.pendingProposal === null,
    canPause: state.clock?.runningSince !== null && state.clock !== undefined,
    currentTurnMs: currentTurnActiveMilliseconds(state, clockAt),
    totalGameMs: totalActiveMilliseconds(state, clockAt),
    rolling,
    lastRoll: state.lastRoll
      ? {
          red: state.lastRoll.numbered.red,
          yellow: state.lastRoll.numbered.yellow,
          event: state.lastRoll.eventFace,
          total: state.lastRoll.total,
          source: state.lastRoll.alchemy ? "alchemy" : "balanced",
          progress: state.lastRoll.progress
            ? {
                discipline: state.lastRoll.progress.discipline,
                redValue: state.lastRoll.progress.red,
                eligiblePlayers: toEligibleProgressPlayers(
                  state,
                  state.lastRoll.progress.discipline,
                ).map((player) => ({
                  id: player.id,
                  name: player.name,
                })),
              }
            : null,
          production: {
            robberActivated: state.barbarian.robberActivated,
          },
        }
      : null,
    numberedCycleProgress: `${state.numberedDeck.cursor} / ${state.numberedDeck.order.length}`,
    // The year-change banner announces something that just happened, so it is
    // tied to the roll that caused it. Without this it would stay on screen
    // for the rest of the game.
    yearChange:
      state.lastYearChange &&
      state.lastYearChange.cycle > 1 &&
      state.lastRoll !== null &&
      state.lastRoll.createdAt === state.lastYearChange.createdAt
        ? {
            cycle: state.lastYearChange.cycle,
            skipped: state.lastYearChange.skipped.map(
              (card) => `${card.red}+${card.yellow}`,
            ),
          }
        : null,
    barbarian: {
      position: state.barbarian.shipPosition,
      trackLength: state.barbarian.rules.trackLength,
    },
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color.hex,
      victoryPoints: scoreForPlayer(state, player.id),
      activeTimeMs: playerActiveMilliseconds(state, player.id, clockAt),
      current: player.id === active.id,
      improvements: { ...player.improvements },
    })),
    worldEventPending: state.thematicEvents.pendingEvent !== null,
    worldEvent:
      state.turn.phase === "resolving-thematic-event" &&
      state.thematicEvents.pendingEvent
        ? toPendingWorldEventView(state.thematicEvents.pendingEvent)
        : null,
    activeEvents: toActiveEventViews(
      state.thematicEvents.activeEvents,
      state.thematicEvents.pendingEvent?.occurrenceId ?? null,
      state.turn.phase,
      state.turn.completedTurns,
      state.players.length,
    ),
    season: toSeasonView(state),
    winnerCandidateName: candidate?.name ?? null,
  };
}

function toSeasonView(state: GameState): GameTableView["season"] {
  const config = state.setup.seasonConfig;
  if (!config?.enabled) return null;
  const info = deriveSeason(config, state.turn.round);
  const firstPlayerIndex = state.players.findIndex(
    (player) => player.id === state.setup.firstPlayerId,
  );
  const transitioned =
    state.turn.round > 1 &&
    state.turn.currentPlayerIndex === firstPlayerIndex &&
    isSeasonTransition(config, state.turn.round - 1, state.turn.round);
  return {
    current: info.season,
    label: SEASON_LABELS[info.season],
    icon: SEASON_ICONS[info.season],
    roundInSeason: info.roundInSeason,
    roundsPerSeason: config.roundsPerSeason,
    transitioned,
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

export function toRollResolutionView(
  state: GameState,
  clockAt: IsoTimestamp = state.updatedAt,
): RollResolutionView {
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
    currentTurnMs: currentTurnActiveMilliseconds(state, clockAt),
    totalGameMs: totalActiveMilliseconds(state, clockAt),
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
  };
}

export function toGameCompleteView(state: GameState): GameCompleteView {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) {
    throw new Error("Completed game has no winner.");
  }
  return {
    title: state.setup.title,
    winnerName: winner.name,
    winnerColor: winner.color.hex,
    completedAt: state.updatedAt,
    rounds: state.turn.round,
    turns: state.statistics.completedTurns,
    totalGameMs: totalActiveMilliseconds(state, state.updatedAt),
    rolls: state.statistics.totalRolls,
    barbarianAttacks: state.barbarian.attacksCompleted,
    thematicEvents: state.statistics.thematicEventsTriggered,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color.hex,
      victoryPoints: scoreForPlayer(state, player.id),
      activeTimeMs: playerActiveMilliseconds(state, player.id, state.updatedAt),
    })),
  };
}
