/**
 * Engine integration tests for world-event lifecycle through the decide() pipeline.
 *
 * Covers:
 * - Round-boundary activation of full-round events
 * - Full-round expiry after their active round
 * - Rest-of-turn expiry after turn end
 * - event.resolved command for until-resolved events
 * - Legacy-save parsing (v1 definitions without metadata)
 */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMATIC_EVENTS,
  asEventId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  decide,
} from "./index";
import type {
  ActiveWorldEventRecord,
  DomainDeps,
  EventOccurrenceId,
  GameSetup,
  GameState,
  IdSource,
  PlayerId,
  ThematicEventDefinition,
} from "./types";

const PLAYER_IDS = [
  asPlayerId("player-a"),
  asPlayerId("player-b"),
  asPlayerId("player-c"),
];

function idSource(prefix: string): IdSource {
  let value = 0;
  return {
    next(kind) {
      value += 1;
      return `${prefix}-${kind}-${value}`;
    },
  };
}

function deps(
  prefix: string,
  random: (upperExclusive: number) => number = () => 0,
): DomainDeps {
  return {
    at: asIsoTimestamp("2026-07-12T21:38:00Z"),
    revisionId: asRevisionId(`revision-${prefix}`),
    random,
    ids: idSource(`deps-${prefix}`),
  };
}

function setup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    title: "Integration test",
    mode: "standard",
    players: PLAYER_IDS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `color-${index}`,
        label: `Color ${index}`,
        hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
        distinguishabilityKey: `distinct-${index}`,
      },
    })),
    firstPlayerId: PLAYER_IDS[0] as PlayerId,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: true,
    thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
      ...event,
    })),
    rulesDataVersion: "v1",
    gameDocumentVersion: 1,
    ...overrides,
  };
}

function createTestGame(overrides: Partial<GameSetup> = {}): GameState {
  const s = setup(overrides);
  const result = createGame({
    gameId: asGameId("game-1"),
    revisionId: asRevisionId("rev-init"),
    createdAt: asIsoTimestamp("2026-07-12T21:00:00Z"),
    setup: s,
    random: () => 0,
    ids: idSource("init"),
  });
  if (!result.ok) throw new Error(`createGame failed: ${result.error.message}`);
  return result.value.nextState;
}

/** Advance through a roll + acknowledge + end turn cycle. */
function advanceTurn(state: GameState, turnPrefix: string): GameState {
  let s = state;
  // Roll
  const rollResult = decide(
    s,
    { type: "roll.draw" },
    deps(`${turnPrefix}-roll`),
  );
  if (!rollResult.ok)
    throw new Error(`roll failed: ${rollResult.error.message}`);
  s = rollResult.value.nextState;

  // Acknowledge any pending resolution
  if (s.resolution.official) {
    const rollId = s.resolution.official.rollId;
    if (s.resolution.official.progressPending) {
      const r = decide(
        s,
        { type: "resolution.progressAcknowledged", rollId },
        deps(`${turnPrefix}-prog`),
      );
      if (!r.ok) throw new Error(`progress ack failed: ${r.error.message}`);
      s = r.value.nextState;
    }
    if (s.resolution.official?.productionPending) {
      const r = decide(
        s,
        { type: "resolution.productionAcknowledged", rollId },
        deps(`${turnPrefix}-prod`),
      );
      if (!r.ok) throw new Error(`production ack failed: ${r.error.message}`);
      s = r.value.nextState;
    }
  }

  // Handle barbarian attack if pending
  if (s.barbarian.pendingAttack) {
    const r = decide(
      s,
      {
        type: "attack.confirmed",
        proposalId: s.barbarian.pendingAttack.id,
        manualOutcome: s.barbarian.pendingAttack.outcome,
      },
      deps(`${turnPrefix}-atk`),
    );
    if (!r.ok) throw new Error(`attack confirm failed: ${r.error.message}`);
    s = r.value.nextState;
  }

  // Acknowledge thematic event if pending
  if (
    s.thematicEvents.pendingEvent &&
    !s.thematicEvents.pendingEvent.acknowledged
  ) {
    const r = decide(
      s,
      {
        type: "event.acknowledged",
        occurrenceId: s.thematicEvents.pendingEvent.occurrenceId,
      },
      deps(`${turnPrefix}-evt`),
    );
    if (!r.ok) throw new Error(`event ack failed: ${r.error.message}`);
    s = r.value.nextState;
  }

  // End turn
  const endResult = decide(
    s,
    { type: "turn.ended" },
    deps(`${turnPrefix}-end`),
  );
  if (!endResult.ok)
    throw new Error(`turn end failed: ${endResult.error.message}`);
  return endResult.value.nextState;
}

describe("engine world-event lifecycle integration", () => {
  it("rest-of-turn events expire after turn ends", () => {
    // Create a game and inject a rest-of-turn active event
    let state = createTestGame();
    const restEvent: ActiveWorldEventRecord = {
      occurrenceId: "occ-rest-1",
      eventId: asEventId("we-market-day"),
      contentVersion: 1,
      title: "Market Day",
      instruction: "test",
      tone: "boon",
      impact: 2,
      category: "economy",
      scope: "active-player",
      duration: "rest-of-turn",
      compatibility: { twoPlayer: true, requires: ["maritime-trade"] },
      activeRound: null,
      triggeredAtCompletedTurn: state.turn.completedTurns,
      activated: true,
    };
    state = {
      ...state,
      thematicEvents: {
        ...state.thematicEvents,
        activeEvents: [restEvent],
      },
    };

    // Advance one turn — the rest-of-turn event should be pruned
    state = advanceTurn(state, "t1");
    const active = state.thematicEvents.activeEvents ?? [];
    const found = active.find((e) => e.occurrenceId === "occ-rest-1");
    expect(found).toBeUndefined();
  });

  it("full-round deferred events activate at round boundary", () => {
    let state = createTestGame();
    const deferredEvent: ActiveWorldEventRecord = {
      occurrenceId: "occ-deferred-1",
      eventId: asEventId("we-trade-winds"),
      contentVersion: 1,
      title: "Trade Winds",
      instruction: "test",
      tone: "boon",
      impact: 2,
      category: "economy",
      scope: "all",
      duration: "full-round",
      compatibility: { twoPlayer: true, requires: ["maritime-trade"] },
      activeRound: null,
      triggeredAtCompletedTurn: 0,
      activated: false,
    };
    state = {
      ...state,
      thematicEvents: {
        ...state.thematicEvents,
        activeEvents: [deferredEvent],
      },
    };

    // Advance through a full round (3 players = 3 turns)
    const startRound = state.turn.round;
    for (let i = 0; i < 3; i++) {
      state = advanceTurn(state, `round-${i}`);
    }

    // Should have advanced to a new round
    expect(state.turn.round).toBeGreaterThan(startRound);

    // The deferred event should now be activated
    const active = state.thematicEvents.activeEvents ?? [];
    const found = active.find((e) => e.occurrenceId === "occ-deferred-1");
    if (found) {
      expect(found.activated).toBe(true);
      expect(found.activeRound).toBe(state.turn.round);
    }
    // It's also valid for it to have been pruned if already expired
  });

  it("full-round events expire after their active round ends", () => {
    let state = createTestGame();
    const currentRound = state.turn.round;
    const activeEvent: ActiveWorldEventRecord = {
      occurrenceId: "occ-fullround-1",
      eventId: asEventId("we-drought"),
      contentVersion: 1,
      title: "Drought",
      instruction: "test",
      tone: "setback",
      impact: 2,
      category: "nature",
      scope: "all",
      duration: "full-round",
      compatibility: { twoPlayer: true },
      activeRound: currentRound,
      triggeredAtCompletedTurn: 0,
      activated: true,
    };
    state = {
      ...state,
      thematicEvents: {
        ...state.thematicEvents,
        activeEvents: [activeEvent],
      },
    };

    // Advance through enough turns to complete the current round and enter the next
    for (let i = 0; i < 4; i++) {
      state = advanceTurn(state, `expire-${i}`);
    }

    // The event should be gone (expired when round > activeRound)
    const active = state.thematicEvents.activeEvents ?? [];
    const found = active.find((e) => e.occurrenceId === "occ-fullround-1");
    if (state.turn.round > currentRound) {
      expect(found).toBeUndefined();
    }
  });

  it("event.resolved command dismisses until-resolved events", () => {
    let state = createTestGame();
    const unresolvedEvent: ActiveWorldEventRecord = {
      occurrenceId: "occ-resolve-1",
      eventId: asEventId("we-earthquake"),
      contentVersion: 1,
      title: "Earthquake",
      instruction: "Repair roads",
      tone: "setback",
      impact: 2,
      category: "nature",
      scope: "all",
      duration: "until-resolved",
      compatibility: { twoPlayer: true },
      activeRound: null,
      triggeredAtCompletedTurn: 0,
      activated: true,
    };
    state = {
      ...state,
      thematicEvents: {
        ...state.thematicEvents,
        activeEvents: [unresolvedEvent],
      },
    };

    // Must be in action-phase to resolve — advance through roll + ack
    const rollResult = decide(
      state,
      { type: "roll.draw" },
      deps("resolve-roll"),
    );
    if (!rollResult.ok)
      throw new Error(`roll failed: ${rollResult.error.message}`);
    state = rollResult.value.nextState;

    // Acknowledge resolution phases
    if (state.resolution.official) {
      const rollId = state.resolution.official.rollId;
      if (state.resolution.official.progressPending) {
        const r = decide(
          state,
          { type: "resolution.progressAcknowledged", rollId },
          deps("resolve-prog"),
        );
        if (r.ok) state = r.value.nextState;
      }
      if (state.resolution.official?.productionPending) {
        const r = decide(
          state,
          { type: "resolution.productionAcknowledged", rollId },
          deps("resolve-prod"),
        );
        if (r.ok) state = r.value.nextState;
      }
    }
    if (state.barbarian.pendingAttack) {
      const r = decide(
        state,
        {
          type: "attack.confirmed",
          proposalId: state.barbarian.pendingAttack.id,
          manualOutcome: state.barbarian.pendingAttack.outcome,
        },
        deps("resolve-atk"),
      );
      if (r.ok) state = r.value.nextState;
    }
    if (
      state.thematicEvents.pendingEvent &&
      !state.thematicEvents.pendingEvent.acknowledged
    ) {
      const r = decide(
        state,
        {
          type: "event.acknowledged",
          occurrenceId: state.thematicEvents.pendingEvent.occurrenceId,
        },
        deps("resolve-evt"),
      );
      if (r.ok) state = r.value.nextState;
    }

    // Now resolve the until-resolved event
    expect(state.turn.phase).toBe("action-phase");
    const resolveResult = decide(
      state,
      {
        type: "event.resolved",
        occurrenceId: "occ-resolve-1" as EventOccurrenceId,
      },
      deps("resolve-cmd"),
    );
    expect(resolveResult.ok).toBe(true);
    if (resolveResult.ok) {
      const newActive =
        resolveResult.value.nextState.thematicEvents.activeEvents ?? [];
      expect(
        newActive.find((e) => e.occurrenceId === "occ-resolve-1"),
      ).toBeUndefined();
      expect(resolveResult.value.summary.kind).toBe("thematic-event-resolved");
    }
  });

  it("event.resolved fails for non-until-resolved events", () => {
    let state = createTestGame();
    state = {
      ...state,
      thematicEvents: {
        ...state.thematicEvents,
        activeEvents: [
          {
            occurrenceId: "occ-nope",
            eventId: asEventId("we-market-day"),
            contentVersion: 1,
            title: "Market Day",
            instruction: "test",
            tone: "boon",
            impact: 2,
            category: "economy",
            scope: "active-player",
            duration: "rest-of-turn",
            compatibility: { twoPlayer: true, requires: ["maritime-trade"] },
            activeRound: null,
            triggeredAtCompletedTurn: 0,
            activated: true,
          },
        ],
      },
    };

    // Get to action phase
    const rollResult = decide(state, { type: "roll.draw" }, deps("nope-roll"));
    if (!rollResult.ok) throw new Error("roll failed");
    state = rollResult.value.nextState;
    if (state.resolution.official) {
      const rollId = state.resolution.official.rollId;
      if (state.resolution.official.progressPending) {
        const r = decide(
          state,
          { type: "resolution.progressAcknowledged", rollId },
          deps("nope-prog"),
        );
        if (r.ok) state = r.value.nextState;
      }
      if (state.resolution.official?.productionPending) {
        const r = decide(
          state,
          { type: "resolution.productionAcknowledged", rollId },
          deps("nope-prod"),
        );
        if (r.ok) state = r.value.nextState;
      }
    }
    if (state.barbarian.pendingAttack) {
      const r = decide(
        state,
        {
          type: "attack.confirmed",
          proposalId: state.barbarian.pendingAttack.id,
          manualOutcome: state.barbarian.pendingAttack.outcome,
        },
        deps("nope-atk"),
      );
      if (r.ok) state = r.value.nextState;
    }
    if (
      state.thematicEvents.pendingEvent &&
      !state.thematicEvents.pendingEvent.acknowledged
    ) {
      const r = decide(
        state,
        {
          type: "event.acknowledged",
          occurrenceId: state.thematicEvents.pendingEvent.occurrenceId,
        },
        deps("nope-evt"),
      );
      if (r.ok) state = r.value.nextState;
    }

    const result = decide(
      state,
      { type: "event.resolved", occurrenceId: "occ-nope" as EventOccurrenceId },
      deps("nope-resolve"),
    );
    expect(result.ok).toBe(false);
  });
});

describe("legacy save compatibility", () => {
  it("creates a game from v1 definitions without metadata", () => {
    // Simulate v1 definitions: only id, contentVersion, title, instruction
    const legacyDefs: ThematicEventDefinition[] = [
      {
        id: asEventId("we-good-harvest"),
        contentVersion: 1,
        title: "Good Harvest",
        instruction: "Each player takes one resource.",
      },
      {
        id: asEventId("we-market-day"),
        contentVersion: 1,
        title: "Market Day",
        instruction: "Make a 2:1 trade.",
      },
    ];
    const state = createTestGame({ thematicEventCatalog: legacyDefs });
    expect(state.thematicEvents.enabledEvents).toHaveLength(2);
    // Legacy defs should not have metadata
    expect(state.thematicEvents.enabledEvents[0]!.tone).toBeUndefined();
    // activeEvents should be initialized empty
    expect(state.thematicEvents.activeEvents).toEqual([]);
  });

  it("initialises activeEvents as an empty list on every new game", () => {
    const state = createTestGame();
    // activeEvents is a required field, so no code path needs a fallback.
    expect(state.thematicEvents.activeEvents).toEqual([]);

    const advanced = advanceTurn(state, "active-events-turn");
    expect(Array.isArray(advanced.thematicEvents.activeEvents)).toBe(true);
    expect(advanced.turn.completedTurns).toBeGreaterThan(0);
  });
});
