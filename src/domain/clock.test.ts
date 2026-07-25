import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  asScoreEntryId,
  createGame,
  currentTurnActiveMilliseconds,
  decide,
  playerActiveMilliseconds,
  totalActiveMilliseconds,
} from "./index";
import type {
  Decision,
  DomainDeps,
  DomainResult,
  GameCommand,
  GameSetup,
  GameState,
  IdSource,
} from "./types";

const PLAYERS = [
  asPlayerId("clock-player-a"),
  asPlayerId("clock-player-b"),
  asPlayerId("clock-player-c"),
];
const CREATED_AT = asIsoTimestamp("2026-07-14T10:00:00.000Z");

describe("game clock", () => {
  it("starts every new game with zeroed player accumulators", () => {
    expect(newGame().clock).toEqual({
      totalActiveMs: 0,
      currentTurnActiveMs: 0,
      playerActiveMs: {
        [PLAYERS[0]!]: 0,
        [PLAYERS[1]!]: 0,
        [PLAYERS[2]!]: 0,
      },
      runningSince: CREATED_AT,
      pausedAt: null,
    });
  });

  it("accrues normal commands and allocates a turn handoff to each player", () => {
    let state = actionPhase(newGame());
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYERS[0]!,
        patch: { name: "First" },
      },
      "2026-07-14T10:00:05.000Z",
    );
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYERS[0]!,
        patch: { name: "Player One" },
      },
      "2026-07-14T10:00:08.000Z",
    );
    state = run(state, { type: "turn.ended" }, "2026-07-14T10:00:10.000Z");

    expect(state.clock).toMatchObject({
      totalActiveMs: 10_000,
      currentTurnActiveMs: 0,
      playerActiveMs: {
        [PLAYERS[0]!]: 10_000,
        [PLAYERS[1]!]: 0,
        [PLAYERS[2]!]: 0,
      },
      runningSince: asIsoTimestamp("2026-07-14T10:00:10.000Z"),
    });

    state = actionPhase(state);
    state = run(
      state,
      {
        type: "player.publicStateAdjusted",
        playerId: PLAYERS[1]!,
        patch: { name: "Second" },
      },
      "2026-07-14T10:00:15.000Z",
    );
    expect(state.clock).toMatchObject({
      totalActiveMs: 15_000,
      currentTurnActiveMs: 5_000,
      playerActiveMs: {
        [PLAYERS[0]!]: 10_000,
        [PLAYERS[1]!]: 5_000,
        [PLAYERS[2]!]: 0,
      },
    });
  });

  it("excludes paused time, blocks other commands, and resumes without accrual", () => {
    let state = run(
      newGame(),
      { type: "clock.paused" },
      "2026-07-14T10:00:05.000Z",
    );
    expect(state.clock).toMatchObject({
      totalActiveMs: 5_000,
      currentTurnActiveMs: 5_000,
      runningSince: null,
      pausedAt: asIsoTimestamp("2026-07-14T10:00:05.000Z"),
    });
    expect(
      decide(state, { type: "roll.draw" }, deps("2026-07-14T10:01:00.000Z")),
    ).toMatchObject({ ok: false, error: { code: "CLOCK_PAUSED" } });
    expect(
      decide(state, { type: "clock.paused" }, deps("2026-07-14T10:01:00.000Z")),
    ).toMatchObject({ ok: false, error: { code: "CLOCK_PAUSED" } });

    state = run(state, { type: "clock.resumed" }, "2026-07-14T10:01:00.000Z");
    expect(state.clock).toMatchObject({
      totalActiveMs: 5_000,
      currentTurnActiveMs: 5_000,
      runningSince: asIsoTimestamp("2026-07-14T10:01:00.000Z"),
      pausedAt: null,
    });
    state = run(state, { type: "roll.draw" }, "2026-07-14T10:01:05.000Z");
    expect(state.clock?.totalActiveMs).toBe(10_000);
    expect(state.clock?.playerActiveMs[PLAYERS[0]!]).toBe(10_000);
  });

  it("accrues final active time and stops on completion", () => {
    const state = actionPhase(withWinningScore(newGame()));
    const completed = run(
      state,
      { type: "game.completed", winnerId: PLAYERS[0]! },
      "2026-07-14T10:00:07.000Z",
    );
    expect(completed.clock).toMatchObject({
      totalActiveMs: 7_000,
      currentTurnActiveMs: 7_000,
      playerActiveMs: { [PLAYERS[0]!]: 7_000 },
      runningSince: null,
      pausedAt: null,
    });
  });

  it("rejects starting a clock that already exists", () => {
    const state = newGame();
    // Every game is created with a clock, so a second start is always invalid.
    expect(
      decide(
        state,
        { type: "clock.started" },
        deps("2026-07-14T10:03:01.000Z"),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });

  it("selects settled and live durations and guards invalid times", () => {
    const state = newGame();
    const at = asIsoTimestamp("2026-07-14T10:00:12.500Z");
    expect(totalActiveMilliseconds(state, at)).toBe(12_500);
    expect(currentTurnActiveMilliseconds(state, at)).toBe(12_500);
    expect(playerActiveMilliseconds(state, PLAYERS[0]!, at)).toBe(12_500);
    expect(playerActiveMilliseconds(state, PLAYERS[1]!, at)).toBe(0);
    // An id with no accumulator entry falls back to zero rather than NaN.
    expect(playerActiveMilliseconds(state, asPlayerId("unknown"), at)).toBe(0);

    const paused = run(
      state,
      { type: "clock.paused" },
      "2026-07-14T10:00:05.000Z",
    );
    expect(
      totalActiveMilliseconds(
        paused,
        asIsoTimestamp("2026-07-14T12:00:00.000Z"),
      ),
    ).toBe(5_000);

    expect(
      totalActiveMilliseconds(state, asIsoTimestamp("not-a-timestamp")),
    ).toBe(0);
  });

  it("rejects invalid command timestamps", () => {
    expect(
      decide(newGame(), { type: "clock.paused" }, deps("not-a-timestamp")),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
  });
});

function newGame(): GameState {
  return unwrap(
    createGame({
      gameId: asGameId("clock-game"),
      revisionId: asRevisionId("clock-revision"),
      createdAt: CREATED_AT,
      setup: setup(),
      random: () => 0,
      ids: ids(),
    }),
  ).nextState;
}

function setup(): GameSetup {
  return {
    title: "Clock test",
    mode: "standard",
    players: PLAYERS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `clock-color-${index}`,
        label: `Color ${index}`,
        hex: ["#cc0000", "#0055cc", "#118833"][index]!,
        distinguishabilityKey: `clock-key-${index}`,
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
      return `clock-${kind}-${value}`;
    },
  };
}

function deps(at: string): DomainDeps {
  return {
    at: asIsoTimestamp(at),
    revisionId: asRevisionId(`clock-revision-${at}`),
    random: () => 0,
    ids: ids(),
  };
}

function run(state: GameState, command: GameCommand, at: string): GameState {
  return unwrapDecision(decide(state, command, deps(at))).nextState;
}

function actionPhase(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: "action-phase" },
    resolution: { official: null },
  };
}

function withWinningScore(state: GameState): GameState {
  return {
    ...state,
    scoreLedger: [
      ...state.scoreLedger,
      {
        id: asScoreEntryId("clock-winning-score"),
        playerId: PLAYERS[0]!,
        delta: 10,
        reason: "manual",
        createdAt: CREATED_AT,
      },
    ],
  };
}

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function unwrapDecision(result: DomainResult<Decision>): Decision {
  return unwrap(result);
}
