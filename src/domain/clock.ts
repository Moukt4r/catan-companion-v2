import { domainError, failure, success } from "./errors";
import type {
  DomainResult,
  GameClockState,
  GameState,
  IsoTimestamp,
  PlayerId,
} from "./types";

const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

export function createGameClock(
  playerIds: readonly PlayerId[],
  at: IsoTimestamp,
): GameClockState {
  return {
    totalActiveMs: 0,
    currentTurnActiveMs: 0,
    playerActiveMs: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ),
    runningSince: at,
    pausedAt: null,
  };
}

export function parseIsoTimestamp(timestamp: IsoTimestamp): number | null {
  const match = ISO_TIMESTAMP.exec(timestamp);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === "Z" ? 0 : Number(match[9]);
  const offsetMinute = match[7] === "Z" ? 0 : Number(match[10]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function elapsedActiveMilliseconds(
  runningSince: IsoTimestamp,
  at: IsoTimestamp,
): number | null {
  const started = parseIsoTimestamp(runningSince);
  const ended = parseIsoTimestamp(at);
  return started === null || ended === null
    ? null
    : Math.max(0, ended - started);
}

export function accrueGameClock(
  state: GameState,
  at: IsoTimestamp,
): DomainResult<GameState> {
  const clock = state.clock;
  if (clock.runningSince === null) {
    return success(state);
  }
  const elapsed = elapsedActiveMilliseconds(clock.runningSince, at);
  if (elapsed === null) {
    return failure(
      domainError(
        "INVALID_CLOCK_STATE",
        "Game clock timestamps must be valid ISO timestamps.",
      ),
    );
  }
  const player = state.players[state.turn.currentPlayerIndex];
  if (player === undefined) {
    return failure(
      domainError(
        "INVARIANT_VIOLATION",
        "The current player is unavailable for clock accrual.",
      ),
    );
  }
  return success({
    ...state,
    clock: {
      ...clock,
      totalActiveMs: clock.totalActiveMs + elapsed,
      currentTurnActiveMs: clock.currentTurnActiveMs + elapsed,
      playerActiveMs: {
        ...clock.playerActiveMs,
        [player.id]: (clock.playerActiveMs[player.id] ?? 0) + elapsed,
      },
      runningSince: at,
    },
  });
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
