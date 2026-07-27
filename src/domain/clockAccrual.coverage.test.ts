/**
 * Coverage for the defensive branches in `accrueGameClock` and `firstFailure`.
 *
 * Gameplay-level tests always accrue against a running clock with a valid
 * current player, so the guard clauses below are only reachable from states
 * that the reducers themselves never produce. They are still real behaviour:
 * a paused clock must accrue nothing, and corrupt persisted state must fail
 * loudly rather than silently mis-bill a player.
 */
import { describe, expect, it } from "vitest";
import { accrueGameClock } from "./clock";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  firstFailure,
} from "./index";
import type {
  DomainError,
  DomainResult,
  GameSetup,
  GameState,
  IdSource,
} from "./types";

const PLAYERS = [
  asPlayerId("accrual-player-a"),
  asPlayerId("accrual-player-b"),
  asPlayerId("accrual-player-c"),
];
const CREATED_AT = asIsoTimestamp("2026-07-26T10:00:00.000Z");
const LATER = asIsoTimestamp("2026-07-26T10:00:05.000Z");

describe("accrueGameClock guards", () => {
  it("returns the state untouched while the clock is paused", () => {
    const state = pausedGame();
    const result = unwrap(accrueGameClock(state, LATER));
    // A paused clock has no runningSince, so nothing may accrue.
    expect(result).toBe(state);
    expect(result.clock.totalActiveMs).toBe(0);
  });

  it("fails when runningSince is not a valid timestamp", () => {
    const state = newGame();
    const corrupt: GameState = {
      ...state,
      clock: { ...state.clock, runningSince: asIsoTimestamp("not-a-time") },
    };
    expect(accrueGameClock(corrupt, LATER)).toMatchObject({
      ok: false,
      error: { code: "INVALID_CLOCK_STATE" },
    });
  });

  it("fails when the current player index points outside the roster", () => {
    const state = newGame();
    const corrupt: GameState = {
      ...state,
      turn: { ...state.turn, currentPlayerIndex: 99 },
    };
    expect(accrueGameClock(corrupt, LATER)).toMatchObject({
      ok: false,
      error: { code: "INVARIANT_VIOLATION" },
    });
  });

  it("treats a missing per-player accumulator as zero", () => {
    const state = newGame();
    const corrupt: GameState = {
      ...state,
      // Persisted documents from older versions can lack an entry for a player.
      clock: { ...state.clock, playerActiveMs: {} },
    };
    const result = unwrap(accrueGameClock(corrupt, LATER));
    expect(result.clock.playerActiveMs[PLAYERS[0]!]).toBe(5_000);
    expect(result.clock.totalActiveMs).toBe(5_000);
  });
});

describe("firstFailure fallback", () => {
  it("reports a generic invariant failure for a non-empty list with no error", () => {
    // A corrupt list is non-empty but yields undefined at index 0, so the
    // fallback error stands in rather than crashing on a missing element.
    const missingFirst: DomainError[] = Array.from({ length: 1 });
    expect(firstFailure(missingFirst)).toMatchObject({
      ok: false,
      error: { code: "INVARIANT_VIOLATION" },
    });
  });
});

function newGame(): GameState {
  return unwrap(
    createGame({
      gameId: asGameId("accrual-game"),
      revisionId: asRevisionId("accrual-revision"),
      createdAt: CREATED_AT,
      setup: setup(),
      random: () => 0,
      ids: ids(),
    }),
  ).nextState;
}

function pausedGame(): GameState {
  const state = newGame();
  return {
    ...state,
    clock: { ...state.clock, runningSince: null, pausedAt: CREATED_AT },
  };
}

function setup(): GameSetup {
  return {
    title: "Clock accrual test",
    mode: "standard",
    players: PLAYERS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `accrual-color-${index}`,
        label: `Color ${index}`,
        hex: ["#cc0000", "#0055cc", "#118833"][index]!,
        distinguishabilityKey: `accrual-key-${index}`,
      },
    })),
    firstPlayerId: PLAYERS[0]!,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: false,
    thematicEventCatalog: [],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

function ids(): IdSource {
  let value = 0;
  return {
    next(kind) {
      value += 1;
      return `accrual-${kind}-${value}`;
    },
  };
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(`Expected success, got ${result.error.code}`);
  }
  return result.value;
}
