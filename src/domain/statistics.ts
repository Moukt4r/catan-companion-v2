/**
 * Derived end-of-game statistics.
 *
 * Everything here is computed from state the app already records: the roll
 * history, the score ledger, the clock and the running counters. Nothing new is
 * persisted, so this adds no command, no schema field and no migration — a
 * finished game from before this existed produces the same numbers as one
 * finished after it.
 *
 * The numbers are deliberately descriptive rather than judgemental. The app
 * does not know who "played well"; it knows what the dice did and how long
 * people took, so that is what it reports.
 */

import type {
  GameState,
  IsoTimestamp,
  PlayerId,
  RollRecord,
  ThematicEventSnapshot,
  WorldEventCategory,
} from "./types";
import { parseIsoTimestamp } from "./clock";
import { playerActiveMilliseconds, scoreForPlayer } from "./selectors";

/** Every total two dice can make. */
export const DICE_TOTALS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type DiceTotal = (typeof DICE_TOTALS)[number];

/**
 * How often each total is expected across 36 equally likely die pairs. Used to
 * show whether the table's luck actually deviated, rather than implying it did.
 */
const WAYS_TO_MAKE: Record<DiceTotal, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface DiceTotalStat {
  total: DiceTotal;
  /** Times this total actually came up. */
  count: number;
  /** Times a fair 36-outcome deck would have produced it over the same rolls. */
  expected: number;
  /** count - expected. Positive means it landed more often than expected. */
  deviation: number;
  /** Share of all rolls, 0-1. */
  share: number;
}

export interface PlayerRollStat {
  playerId: PlayerId;
  rolls: number;
  /** Sum of every numbered total this player rolled. */
  pipTotal: number;
  /** Mean numbered total, or null when the player never rolled. */
  averageTotal: number | null;
  sevens: number;
  alchemyRolls: number;
  barbarianFaces: number;
  /**
   * Production pips this player generated compared with what an average roll
   * would have produced over the same count. Positive is luckier than average.
   */
  luckIndex: number;
  activeMs: number;
  /** Mean active time per completed turn, or null when they took none. */
  averageTurnMs: number | null;
  turns: number;
  victoryPoints: number;
}

export interface WorldEventCategoryStat {
  category: WorldEventCategory | "unknown";
  count: number;
}

export interface ScoreTimelinePoint {
  playerId: PlayerId;
  at: IsoTimestamp;
  /** Running total after this entry. */
  score: number;
}

export interface GameStatisticsReport {
  totalRolls: number;
  normalRolls: number;
  alchemyRolls: number;
  /** Mean numbered total across every roll, or null when nothing was rolled. */
  averageTotal: number | null;
  /** The total that came up most often, or null when nothing was rolled. */
  mostCommonTotal: DiceTotal | null;
  /** Lowest-count total that was actually rolled at least once. */
  rarestRolledTotal: DiceTotal | null;
  diceTotals: DiceTotalStat[];
  eventFaces: { face: string; count: number; share: number }[];
  players: PlayerRollStat[];
  worldEventsByCategory: WorldEventCategoryStat[];
  scoreTimeline: ScoreTimelinePoint[];
  /** Deck reshuffles, i.e. how many "years" the table played through. */
  yearChanges: number;
  barbarianAttacks: number;
}

/** Mean numbered total of a fair two-die roll. */
const FAIR_AVERAGE_TOTAL = 7;

export function buildGameStatistics(
  state: GameState,
  at: IsoTimestamp,
): GameStatisticsReport {
  const rolls = state.history.rolls;
  const totalRolls = rolls.length;

  const diceTotals = buildDiceTotals(rolls);
  const players = state.players.map((player) =>
    buildPlayerStat(state, player.id, at),
  );

  return {
    totalRolls,
    normalRolls: rolls.filter((roll) => !roll.alchemy).length,
    alchemyRolls: rolls.filter((roll) => roll.alchemy).length,
    averageTotal: meanTotal(rolls),
    mostCommonTotal: pickTotal(
      diceTotals,
      (best, candidate) => candidate.count > best.count,
    ),
    rarestRolledTotal: pickTotal(
      diceTotals.filter((entry) => entry.count > 0),
      (best, candidate) => candidate.count < best.count,
    ),
    diceTotals,
    eventFaces: buildEventFaces(rolls),
    players,
    worldEventsByCategory: buildWorldEventCategories(
      state.history.thematicEvents,
    ),
    scoreTimeline: buildScoreTimeline(state),
    yearChanges: state.history.yearChanges.length,
    barbarianAttacks: state.statistics.barbarianAttacks,
  };
}

function buildDiceTotals(rolls: readonly RollRecord[]): DiceTotalStat[] {
  const counts = new Map<number, number>();
  for (const roll of rolls) {
    counts.set(roll.total, (counts.get(roll.total) ?? 0) + 1);
  }

  return DICE_TOTALS.map((total) => {
    const count = counts.get(total) ?? 0;
    const expected = (rolls.length * WAYS_TO_MAKE[total]) / 36;
    return {
      total,
      count,
      expected,
      deviation: count - expected,
      share: rolls.length === 0 ? 0 : count / rolls.length,
    };
  });
}

function buildEventFaces(
  rolls: readonly RollRecord[],
): { face: string; count: number; share: number }[] {
  const counts = new Map<string, number>();
  for (const roll of rolls) {
    counts.set(roll.eventFace, (counts.get(roll.eventFace) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([face, count]) => ({
      face,
      count,
      share: rolls.length === 0 ? 0 : count / rolls.length,
    }))
    .sort((left, right) => right.count - left.count);
}

function buildPlayerStat(
  state: GameState,
  playerId: PlayerId,
  at: IsoTimestamp,
): PlayerRollStat {
  const rolls = state.history.rolls.filter(
    (roll) => roll.playerId === playerId,
  );
  const pipTotal = rolls.reduce((sum, roll) => sum + roll.total, 0);
  const activeMs = playerActiveMilliseconds(state, playerId, at);

  // Turns taken is the number of distinct turn numbers this player rolled in.
  // Counting rolls would overstate it whenever a turn was rolled more than once.
  const turns = new Set(rolls.map((roll) => roll.turnNumber)).size;

  return {
    playerId,
    rolls: rolls.length,
    pipTotal,
    averageTotal: rolls.length === 0 ? null : pipTotal / rolls.length,
    sevens: rolls.filter((roll) => roll.total === 7).length,
    alchemyRolls: rolls.filter((roll) => roll.alchemy).length,
    barbarianFaces: rolls.filter((roll) => roll.eventFace === "barbarian")
      .length,
    luckIndex: pipTotal - rolls.length * FAIR_AVERAGE_TOTAL,
    activeMs,
    averageTurnMs: turns === 0 ? null : activeMs / turns,
    turns,
    victoryPoints: scoreForPlayer(state, playerId),
  };
}

function buildWorldEventCategories(
  events: readonly ThematicEventSnapshot[],
): WorldEventCategoryStat[] {
  const counts = new Map<WorldEventCategory | "unknown", number>();
  for (const event of events) {
    // Legacy snapshots predate categories, so they are grouped rather than
    // dropped: the count of events still has to add up.
    const category = event.category ?? "unknown";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count);
}

/**
 * Running score per player, in ledger order.
 *
 * Entries without a parseable timestamp are still included, because dropping
 * them would make the final point of the timeline disagree with the score shown
 * everywhere else.
 */
function buildScoreTimeline(
  state: Pick<GameState, "scoreLedger">,
): ScoreTimelinePoint[] {
  const running = new Map<PlayerId, number>();
  const ordered = [...state.scoreLedger].sort((left, right) => {
    const leftAt = parseIsoTimestamp(left.createdAt);
    const rightAt = parseIsoTimestamp(right.createdAt);
    if (leftAt === null || rightAt === null) {
      return 0;
    }
    return leftAt - rightAt;
  });

  return ordered.map((entry) => {
    const next = (running.get(entry.playerId) ?? 0) + entry.delta;
    running.set(entry.playerId, next);
    return { playerId: entry.playerId, at: entry.createdAt, score: next };
  });
}

function meanTotal(rolls: readonly RollRecord[]): number | null {
  if (rolls.length === 0) {
    return null;
  }
  return rolls.reduce((sum, roll) => sum + roll.total, 0) / rolls.length;
}

function pickTotal(
  entries: readonly DiceTotalStat[],
  isBetter: (best: DiceTotalStat, candidate: DiceTotalStat) => boolean,
): DiceTotal | null {
  const [first, ...rest] = entries;
  if (first === undefined) {
    return null;
  }
  let best = first;
  for (const candidate of rest) {
    if (isBetter(best, candidate)) {
      best = candidate;
    }
  }
  return best.count === 0 ? null : best.total;
}
