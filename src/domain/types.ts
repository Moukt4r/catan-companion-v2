export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type GameId = Brand<string, "GameId">;
export type BoardDesignId = Brand<string, "BoardDesignId">;
export type PlayerId = Brand<string, "PlayerId">;
export type RevisionId = Brand<string, "RevisionId">;
export type RollId = Brand<string, "RollId">;
export type EventId = Brand<string, "EventId">;
export type EventOccurrenceId = Brand<string, "EventOccurrenceId">;
export type ProposalId = Brand<string, "ProposalId">;
export type ScoreEntryId = Brand<string, "ScoreEntryId">;
export type CommandId = Brand<string, "CommandId">;
export type IsoTimestamp = Brand<string, "IsoTimestamp">;

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;
export type ImprovementLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type MetropolisDiscipline = "science" | "trade" | "politics";
export type ProgressDiscipline = MetropolisDiscipline;
export type EventFace = "barbarian" | ProgressDiscipline;
export type GameStatus = "active" | "completed";
export type GameMode = "standard" | "two-player-house-rule";
export type GamePhase =
  | "awaiting-roll"
  | "resolving-official-result"
  | "resolving-barbarian-attack"
  | "resolving-thematic-event"
  | "action-phase"
  | "turn-complete"
  | "completed";

// ---------------------------------------------------------------------------
// World Event metadata types (shared across domain, persistence, UI)
// ---------------------------------------------------------------------------

/** Tone describes the net effect on the table. */
export type WorldEventTone = "boon" | "mixed" | "setback";

/** Impact 1–3: how game-altering the event is. */
export type WorldEventImpact = 1 | 2 | 3;

/** Category groups events thematically for filtering / pack selection. */
export type WorldEventCategory =
  "economy" | "military" | "diplomacy" | "nature" | "society";

/** Which players are affected. */
export type WorldEventScope = "all" | "active-player" | "conditional";

/**
 * Duration describes how long the effect lasts:
 * - immediate:              resolve once, done
 * - rest-of-turn:           active until the current player ends their turn
 * - full-round:             activates at the next round boundary, lasts one full round
 * - until-next-occurrence:  persists until the same event (or any event) fires again
 * - until-resolved:         requires explicit manual dismissal
 */
export type WorldEventDuration =
  | "immediate"
  | "rest-of-turn"
  | "full-round"
  | "until-next-occurrence"
  | "until-resolved";

/**
 * Compatibility & prerequisite metadata.
 * Pragmatic: covers two-player suitability and explicit C&K feature requirements
 * for pack/setup filtering.
 */
export interface WorldEventCompatibility {
  /** If true the event is safe with two-player house rules. */
  twoPlayer: boolean;
  /** C&K features the event interacts with; empty = no special requirements. */
  requires?: WorldEventPrerequisite[];
}

/** Named prerequisites that an event may depend on. */
export type WorldEventPrerequisite =
  | "knights"
  | "cities"
  | "improvements"
  | "progress-cards"
  | "robber"
  | "maritime-trade";

// ---------------------------------------------------------------------------
// Thematic event types
// ---------------------------------------------------------------------------

export interface PlayerColor {
  id: string;
  label: string;
  hex: string;
  distinguishabilityKey: string;
}

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  ordinaryCities?: number;
  activeKnights?: Partial<KnightCounts>;
  inactiveKnights?: Partial<KnightCounts>;
  cityWalls?: number;
  improvements?: Partial<ImprovementLevels>;
  initialScore?: number;
}

/**
 * Thematic event definition — the shape stored in game setup catalogs.
 * V1 (legacy) saves carry only id/contentVersion/title/instruction.
 * V2+ saves include full metadata for catalog-independent operation.
 */
export interface ThematicEventDefinition {
  id: EventId;
  contentVersion: number;
  title: string;
  instruction: string;
  /** Present on v2+ definitions; absent on legacy saves. */
  tone?: WorldEventTone;
  impact?: WorldEventImpact;
  category?: WorldEventCategory;
  scope?: WorldEventScope;
  duration?: WorldEventDuration;
  compatibility?: WorldEventCompatibility;
}

export interface GameSetup {
  title: string;
  mode: GameMode;
  players: PlayerSetup[];
  firstPlayerId: PlayerId;
  victoryTarget: number;
  /**
   * World Event trigger chance per eligible turn, 0-100 (integer percent).
   * 0 disables triggering; 100 fires on every eligible turn.
   */
  thematicEventPercent: number;
  thematicEventsEnabled: boolean;
  thematicEventCatalog: ThematicEventDefinition[];
  /**
   * How many numbered cards may remain undrawn before the deck reshuffles into
   * a new year. 0 keeps the exact-coverage behaviour (all 36 cards drawn).
   */
  numberedReshuffleThreshold: number;
  /** Optional Seasons Mode config. Missing or `{ enabled: false }` means off. */
  seasonConfig?: {
    enabled: boolean;
    roundsPerSeason: 2 | 3 | 4;
    startingSeason: "spring" | "summer" | "autumn" | "winter";
  };
  rulesDataVersion: string;
  gameDocumentVersion: number;
}

export interface KnightCounts {
  basic: number;
  strong: number;
  mighty: number;
}

export interface ImprovementLevels {
  science: ImprovementLevel;
  trade: ImprovementLevel;
  politics: ImprovementLevel;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  order: number;
  ordinaryCities: number;
  /** Knights that are currently activated and defend against barbarians. */
  activeKnights: KnightCounts;
  /**
   * Knights that are built but not activated. They hold board positions and
   * can be activated later, but contribute no defence.
   */
  inactiveKnights: KnightCounts;
  /** Built city walls. Each wall raises the safe hand limit by two cards. */
  cityWalls: number;
  improvements: ImprovementLevels;
}

export type ScoreReason =
  | "initial"
  | "manual"
  | "defender"
  | "metropolis"
  | "merchant"
  | "longest-road"
  | "revealed-progress-vp"
  | "correction";

export interface ScoreEntry {
  id: ScoreEntryId;
  playerId: PlayerId;
  delta: number;
  reason: ScoreReason;
  note?: string;
  createdAt: IsoTimestamp;
}

export type MetropolisControl = {
  holderId: PlayerId;
  status: "temporary" | "permanent";
} | null;

export type MetropolisControls = Record<
  MetropolisDiscipline,
  MetropolisControl
>;

export interface MetropolisChange {
  playerId: PlayerId;
  ordinaryCityDelta: number;
  scoreDelta: number;
}

export interface MetropolisProposal {
  id: ProposalId;
  discipline: MetropolisDiscipline;
  source: "improvement" | "correction";
  from: MetropolisControl;
  to: MetropolisControl;
  changes: MetropolisChange[];
  summary: string;
}

export interface MetropolisState {
  controls: MetropolisControls;
  pendingProposal: MetropolisProposal | null;
}

export interface NumberedOutcome {
  red: DieValue;
  yellow: DieValue;
}

export interface DeckState<T> {
  cycle: number;
  cursor: number;
  order: T[];
  createdAtRevision: RevisionId;
}

export type NumberedDeckState = DeckState<NumberedOutcome>;
export type EventDeckState = DeckState<EventFace>;

export interface TriggerToken {
  trigger: boolean;
}

/**
 * Snapshot of a thematic event as it was when triggered.
 * History records carry this shape; metadata is optional for legacy compat.
 */
export interface ThematicEventSnapshot {
  occurrenceId: EventOccurrenceId;
  eventId: EventId;
  contentVersion: number;
  title: string;
  instruction: string;
  triggeredAtCompletedTurn: number;
  acknowledged: boolean;
  /** Present on v2+ snapshots; absent on legacy saves. */
  tone?: WorldEventTone;
  impact?: WorldEventImpact;
  category?: WorldEventCategory;
  scope?: WorldEventScope;
  duration?: WorldEventDuration;
}

/**
 * A lifecycle-tracked active world event.
 * Content snapshot — stable, no catalog lookup needed at read time.
 */
export interface ActiveWorldEventRecord {
  occurrenceId: string;
  eventId: EventId;
  contentVersion: number;
  title: string;
  instruction: string;
  tone: WorldEventTone;
  impact: WorldEventImpact;
  category: WorldEventCategory;
  scope: WorldEventScope;
  duration: WorldEventDuration;
  compatibility: WorldEventCompatibility;
  activeRound: number | null;
  triggeredAtCompletedTurn: number;
  activated: boolean;
}

export interface ThematicEventState {
  enabled: boolean;
  /** Trigger chance per eligible turn, 0-100 (integer percent). */
  percent: number;
  enabledEvents: ThematicEventDefinition[];
  triggerBag: DeckState<TriggerToken>;
  eventDeck: DeckState<EventId>;
  deferredTrigger: boolean;
  lastTriggeredAtCompletedTurn: number | null;
  previousEventId: EventId | null;
  pendingEvent: ThematicEventSnapshot | null;
  /** Active lifecycle-tracked events. */
  activeEvents: ActiveWorldEventRecord[];
}

export interface BarbarianRules {
  trackLength: number;
  knightComponentLimitPerLevel: number;
}

export interface BarbarianAttackStrengths {
  barbarian: number;
  defenders: number;
  contributions: Array<{ playerId: PlayerId; strength: number }>;
}

export type BarbarianAttackOutcome =
  | {
      type: "defenders-win";
      reward:
        | { type: "defender-point"; playerId: PlayerId }
        | { type: "progress-choice"; playerIds: PlayerId[] };
    }
  | { type: "barbarians-win"; pillagedPlayerIds: PlayerId[] }
  | { type: "board-authoritative" };

export interface BarbarianAttackProposal {
  id: ProposalId;
  strengths: BarbarianAttackStrengths;
  outcome: BarbarianAttackOutcome;
  firstAttack: boolean;
  summary: string;
}

export interface BarbarianAttackRecord {
  proposalId: ProposalId;
  completedAt: IsoTimestamp;
  strengths: BarbarianAttackStrengths;
  outcome: BarbarianAttackOutcome;
  progressChoices: Array<{
    playerId: PlayerId;
    discipline: ProgressDiscipline;
  }>;
}

export interface BarbarianState {
  shipPosition: number;
  robberActivated: boolean;
  attacksCompleted: number;
  rules: BarbarianRules;
  pendingAttack: BarbarianAttackProposal | null;
  history: BarbarianAttackRecord[];
}

export interface ProgressGuidance {
  discipline: ProgressDiscipline;
  eligiblePlayerIds: PlayerId[];
  red: DieValue;
}

export type ProductionGuidance =
  | { type: "production"; total: number }
  | {
      type: "seven";
      robberActive: boolean;
      reminder: "robber-not-yet-active" | "discard-and-move-robber";
    };

export interface RollRecord {
  id: RollId;
  playerId: PlayerId;
  turnNumber: number;
  round: number;
  numbered: NumberedOutcome;
  total: number;
  eventFace: EventFace;
  alchemy: boolean;
  numberedDeckCycle: number;
  numberedDeckIndex: number | null;
  eventDeckCycle: number;
  eventDeckIndex: number;
  progress: ProgressGuidance | null;
  production: ProductionGuidance;
  thematicEventOccurrenceId: EventOccurrenceId | null;
  createdAt: IsoTimestamp;
}

export interface OfficialResolution {
  rollId: RollId;
  progressPending: boolean;
  productionPending: boolean;
}

export interface ResolutionState {
  official: OfficialResolution | null;
}

export interface TurnState {
  phase: GamePhase;
  currentPlayerIndex: number;
  round: number;
  turnNumber: number;
  completedTurns: number;
}

export interface GameClockState {
  totalActiveMs: number;
  currentTurnActiveMs: number;
  playerActiveMs: Record<PlayerId, number>;
  runningSince: IsoTimestamp | null;
  pausedAt: IsoTimestamp | null;
}

export interface GameStatistics {
  totalRolls: number;
  normalRolls: number;
  alchemyRolls: number;
  completedTurns: number;
  completedRounds: number;
  numberedTotals: Record<string, number>;
  eventFaces: Record<EventFace, number>;
  barbarianAttacksWon: number;
  barbarianAttacksLost: number;
  thematicEventsTriggered: number;
}

/**
 * Records the moment the numbered deck reshuffled into a new year, including
 * any cards that were never drawn because of an early-reshuffle threshold.
 */
export interface YearChangeRecord {
  cycle: number;
  turnNumber: number;
  round: number;
  skipped: NumberedOutcome[];
  createdAt: IsoTimestamp;
}

export interface GameHistory {
  rolls: RollRecord[];
  thematicEvents: ThematicEventSnapshot[];
  /** Year (deck cycle) boundaries. */
  yearChanges: YearChangeRecord[];
}

export interface GameState {
  id: GameId;
  revisionId: RevisionId;
  revisionNumber: number;
  status: GameStatus;
  winnerId: PlayerId | null;
  setup: GameSetup;
  turn: TurnState;
  clock: GameClockState;
  players: PlayerState[];
  metropolises: MetropolisState;
  numberedDeck: NumberedDeckState;
  eventDeck: EventDeckState;
  thematicEvents: ThematicEventState;
  barbarian: BarbarianState;
  resolution: ResolutionState;
  scoreLedger: ScoreEntry[];
  lastRoll: RollRecord | null;
  /** Most recent year change, surfaced for announcement. Null before any. */
  lastYearChange: YearChangeRecord | null;
  statistics: GameStatistics;
  history: GameHistory;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface PublicStatePatch {
  name?: string;
  ordinaryCities?: number;
  activeKnights?: Partial<KnightCounts>;
  inactiveKnights?: Partial<KnightCounts>;
  cityWalls?: number;
  improvements?: Partial<ImprovementLevels>;
  scoreAdjustment?: {
    delta: number;
    reason: Exclude<ScoreReason, "initial" | "defender" | "metropolis">;
    note?: string;
  };
}

export type GameCommand =
  | { type: "clock.started" }
  | { type: "clock.paused" }
  | { type: "clock.resumed" }
  | { type: "roll.draw" }
  | { type: "roll.alchemy"; red: DieValue; yellow: DieValue }
  | { type: "resolution.progressAcknowledged"; rollId: RollId }
  | { type: "resolution.productionAcknowledged"; rollId: RollId }
  | {
      type: "player.publicStateAdjusted";
      playerId: PlayerId;
      patch: PublicStatePatch;
    }
  | {
      type: "metropolis.assignmentProposed";
      discipline: MetropolisDiscipline;
      holderId: PlayerId | null;
      status: "temporary" | "permanent" | null;
    }
  | {
      type: "metropolis.correctionProposed";
      discipline: MetropolisDiscipline;
      holderId: PlayerId | null;
      status: "temporary" | "permanent" | null;
    }
  | { type: "metropolis.proposalConfirmed"; proposalId: ProposalId }
  | { type: "metropolis.proposalCancelled"; proposalId: ProposalId }
  | {
      type: "attack.confirmed";
      proposalId: ProposalId;
      manualOutcome: BarbarianAttackOutcome;
      progressChoices?: Array<{
        playerId: PlayerId;
        discipline: ProgressDiscipline;
      }>;
    }
  | {
      type: "event.acknowledged";
      occurrenceId: EventOccurrenceId;
    }
  | {
      type: "event.resolved";
      occurrenceId: EventOccurrenceId;
    }
  | { type: "turn.ended" }
  | { type: "game.completed"; winnerId: PlayerId };

export type GeneratedIdKind =
  "roll" | "event-occurrence" | "proposal" | "score-entry";

export interface IdSource {
  next(kind: GeneratedIdKind): string;
}

export interface RandomSource {
  nextUint32(): number;
}

export type BoundedIntSource = (upperExclusive: number) => number;

export interface DomainDeps {
  at: IsoTimestamp;
  revisionId: RevisionId;
  random: RandomSource | BoundedIntSource;
  ids: IdSource;
}

export interface CreateGameInput {
  gameId: GameId;
  revisionId: RevisionId;
  createdAt: IsoTimestamp;
  setup: GameSetup;
  random: RandomSource | BoundedIntSource;
  ids: IdSource;
  barbarianRules?: Partial<BarbarianRules>;
}

export type JournalSummaryKind =
  | "game-created"
  | "clock-started"
  | "clock-paused"
  | "clock-resumed"
  | "roll-drawn"
  | "alchemy-used"
  | "resolution-acknowledged"
  | "player-adjusted"
  | "metropolis-proposed"
  | "metropolis-confirmed"
  | "metropolis-cancelled"
  | "attack-confirmed"
  | "thematic-event-acknowledged"
  | "thematic-event-resolved"
  | "turn-ended"
  | "game-completed";

export interface JournalSummary {
  kind: JournalSummaryKind;
  text: string;
  playerIds: PlayerId[];
}

export type PresentationSummary =
  | {
      type: "game-created";
      currentPlayerId: PlayerId;
      houseRules: string[];
    }
  | { type: "clock-started"; at: IsoTimestamp }
  | { type: "clock-paused"; at: IsoTimestamp }
  | { type: "clock-resumed"; at: IsoTimestamp }
  | {
      type: "roll";
      roll: RollRecord;
      phase: GamePhase;
      barbarianAttack: BarbarianAttackProposal | null;
      thematicEventPending: boolean;
    }
  | {
      type: "resolution";
      phase: GamePhase;
      pendingProgress: boolean;
      pendingProduction: boolean;
    }
  | {
      type: "player-state";
      playerId: PlayerId;
      score: number;
      metropolisProposal: MetropolisProposal | null;
    }
  | {
      type: "metropolis";
      proposal: MetropolisProposal | null;
      controls: MetropolisControls;
    }
  | {
      type: "barbarian-attack";
      record: BarbarianAttackRecord;
      phase: GamePhase;
    }
  | {
      type: "thematic-event";
      event: ThematicEventSnapshot;
      phase: GamePhase;
    }
  | {
      type: "turn";
      currentPlayerId: PlayerId;
      round: number;
      turnNumber: number;
      winnerCandidateIds: PlayerId[];
    }
  | { type: "game-completed"; winnerId: PlayerId };

export interface Decision {
  nextState: GameState;
  summary: JournalSummary;
  presentation: PresentationSummary;
}

export type DomainErrorCode =
  | "NO_ACTIVE_GAME"
  | "INVALID_PHASE"
  | "INVALID_SETUP"
  | "INVALID_PLAYER_STATE"
  | "INVALID_SCORE"
  | "INVALID_DECK_STATE"
  | "DECK_STATE_CORRUPT"
  | "INVALID_THEMATIC_STATE"
  | "INVALID_METROPOLIS_STATE"
  | "INVALID_BARBARIAN_STATE"
  | "INVALID_RESOLUTION_STATE"
  | "INVALID_CLOCK_STATE"
  | "CLOCK_PAUSED"
  | "INVALID_COMMAND"
  | "STALE_ROLL"
  | "ATTACK_CONFIRMATION_STALE"
  | "METROPOLIS_CONFIRMATION_STALE"
  | "REVISION_CONFLICT"
  | "WINNER_NOT_ELIGIBLE"
  | "INVARIANT_VIOLATION";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  details: Record<string, string | number | boolean | null>;
}

export type DomainResult<T> =
  { ok: true; value: T } | { ok: false; error: DomainError };
