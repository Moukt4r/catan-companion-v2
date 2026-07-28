import { describe, expect, it } from "vitest";
import {
  asCommandId,
  asEventId,
  asEventOccurrenceId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asProposalId,
  asRevisionId,
  asRollId,
  asScoreEntryId,
  createThematicEventDeck,
  createThematicState,
  currentPlayer,
  domainError,
  drawDeck,
  failure,
  firstFailure,
  fisherYates,
  isProgressEligible,
  metropolisCountForPlayer,
  playersInCurrentTurnOrder,
  proposeMetropolisChange,
  referencesPlayer,
  scheduleThematicEvent,
  scoreForPlayer,
  success,
  toBoundedInt,
  uniformBoundedInt,
  winnerCandidates,
} from "./index";
import type {
  DeckState,
  GameState,
  MetropolisControl,
  MetropolisDiscipline,
  PlayerId,
  PlayerState,
  ScoreEntry,
  ThematicEventDefinition,
  ThematicEventState,
} from "./types";

const REVISION = asRevisionId("revision");
const PLAYER_A = asPlayerId("player-a");
const PLAYER_B = asPlayerId("player-b");
const UNKNOWN_PLAYER = asPlayerId("unknown");

function player(id: PlayerId, science: 0 | 1 | 2 | 3 | 4 | 5 = 0): PlayerState {
  return {
    id,
    name: id,
    color: {
      id: `${id}-color`,
      label: `${id} color`,
      hex: "#123456",
      distinguishabilityKey: `${id}-key`,
    },
    order: id === PLAYER_A ? 0 : 1,
    improvements: { science, trade: 0, politics: 0 },
  };
}

function metropolisState(
  players = [player(PLAYER_A), player(PLAYER_B)],
  science: MetropolisControl = null,
  // Transfers clamp the outgoing holder's loss at their current score, so the
  // ledger is part of the input now. Default everyone to a comfortable score so
  // existing cases keep exercising the full two-point move.
  scores: Partial<Record<string, number>> = {},
): {
  players: PlayerState[];
  metropolises: GameState["metropolises"];
  scoreLedger: ScoreEntry[];
} {
  return {
    players,
    metropolises: {
      controls: { science, trade: null, politics: null },
      pendingProposal: null,
    },
    scoreLedger: players.map((holder, index) => ({
      id: asScoreEntryId(`seed-${holder.id}`),
      playerId: holder.id,
      delta: scores[holder.id] ?? 10,
      reason: "correction" as const,
      createdAt: asIsoTimestamp(`2026-07-12T20:0${index}:00Z`),
    })),
  };
}

function definition(id: string): ThematicEventDefinition {
  return {
    id: asEventId(id),
    contentVersion: 1,
    title: `Title ${id}`,
    instruction: `Instruction ${id}`,
  };
}

function thematicState(
  overrides: Partial<ThematicEventState> = {},
): ThematicEventState {
  const base = createThematicState(
    true,
    13,
    [definition("one"), definition("two")],
    () => 0,
    REVISION,
  );
  return { ...base, ...overrides };
}

describe("result, ID, selector, and progress helpers", () => {
  it("constructs results and returns the first invariant failure", () => {
    const error = domainError("INVALID_COMMAND", "bad", { value: 1 });
    expect(success(3)).toEqual({ ok: true, value: 3 });
    expect(failure(error)).toEqual({ ok: false, error });
    expect(firstFailure([])).toEqual({ ok: true, value: undefined });
    expect(firstFailure([error])).toEqual({ ok: false, error });
  });

  it("brands every identifier without changing its runtime value", () => {
    expect([
      asGameId("id"),
      asPlayerId("id"),
      asRevisionId("id"),
      asRollId("id"),
      asEventId("id"),
      asEventOccurrenceId("id"),
      asProposalId("id"),
      asScoreEntryId("id"),
      asCommandId("id"),
      asIsoTimestamp("id"),
    ]).toEqual(Array.from({ length: 10 }, () => "id"));
  });

  it("calculates selector totals, current order, and winner candidates", () => {
    const players = [player(PLAYER_A), player(PLAYER_B)];
    const state = {
      players,
      metropolises: {
        controls: {
          science: { holderId: PLAYER_A, status: "temporary" as const },
          trade: { holderId: PLAYER_A, status: "permanent" as const },
          politics: null,
        },
      },
      scoreLedger: [
        {
          id: asScoreEntryId("a"),
          playerId: PLAYER_A,
          delta: 5,
          reason: "initial" as const,
          createdAt: asIsoTimestamp("2026-01-01T00:00:00Z"),
        },
        {
          id: asScoreEntryId("b"),
          playerId: PLAYER_B,
          delta: 2,
          reason: "initial" as const,
          createdAt: asIsoTimestamp("2026-01-01T00:00:00Z"),
        },
      ],
      setup: { victoryTarget: 5 },
      turn: { currentPlayerIndex: 1 },
    } as GameState;

    expect(metropolisCountForPlayer(state, PLAYER_A)).toBe(2);
    expect(scoreForPlayer(state, PLAYER_A)).toBe(5);
    expect(currentPlayer(state).id).toBe(PLAYER_B);
    expect(winnerCandidates(state)).toEqual([PLAYER_A]);
    expect(referencesPlayer([PLAYER_A], PLAYER_A)).toBe(true);
    expect(referencesPlayer([PLAYER_A], PLAYER_B)).toBe(false);
    expect(playersInCurrentTurnOrder(players, 1).map(({ id }) => id)).toEqual([
      PLAYER_B,
      PLAYER_A,
    ]);
  });

  it("covers every progress eligibility boundary", () => {
    const expectedMaximumRed = [0, 2, 3, 4, 5, 6] as const;
    for (let level = 0; level <= 5; level += 1) {
      for (let red = 1; red <= 6; red += 1) {
        expect(
          isProgressEligible(
            level as 0 | 1 | 2 | 3 | 4 | 5,
            red as 1 | 2 | 3 | 4 | 5 | 6,
          ),
        ).toBe(red <= expectedMaximumRed[level]!);
      }
    }
  });
});

describe("random and generic deck failures", () => {
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid random bound %s",
    (bound) => {
      expect(uniformBoundedInt({ nextUint32: () => 0 }, bound)).toMatchObject({
        ok: false,
        error: { code: "INVALID_COMMAND" },
      });
    },
  );

  it.each([-1, 1.5, 0x1_0000_0000])(
    "rejects invalid uint32 value %s",
    (candidate) => {
      expect(
        uniformBoundedInt({ nextUint32: () => candidate }, 2),
      ).toMatchObject({
        ok: false,
        error: { code: "INVALID_COMMAND" },
      });
    },
  );

  it("adapts RandomSource and throws when it returns invalid data", () => {
    expect(toBoundedInt((bound) => bound - 1)(4)).toBe(3);
    expect(toBoundedInt({ nextUint32: () => 5 })(4)).toBe(1);
    expect(() => toBoundedInt({ nextUint32: () => -1 })(4)).toThrow(
      "INVALID_COMMAND",
    );
  });

  it.each([-1, 1.5, 3])(
    "rejects invalid Fisher-Yates swap index %s",
    (swapIndex) => {
      expect(() => fisherYates([1, 2, 3], () => swapIndex)).toThrow(
        "Bounded random source returned",
      );
    },
  );

  it("rejects corrupt input and corrupt next-cycle decks", () => {
    const corrupt: DeckState<number> = {
      cycle: 1,
      cursor: -1,
      order: [1],
      createdAtRevision: REVISION,
    };
    expect(drawDeck(corrupt, () => corrupt)).toMatchObject({
      ok: false,
      error: { code: "DECK_STATE_CORRUPT" },
    });

    const exhausted = { ...corrupt, cursor: 1 };
    expect(
      drawDeck(exhausted, (cycle) => ({
        cycle,
        cursor: 0,
        order: [],
        createdAtRevision: REVISION,
      })),
    ).toMatchObject({
      ok: false,
      error: { code: "DECK_STATE_CORRUPT" },
    });
  });
});

describe("metropolis proposal rules", () => {
  const proposalId = asProposalId("proposal");

  function propose(
    state: ReturnType<typeof metropolisState>,
    to: MetropolisControl,
    source: "improvement" | "correction" = "improvement",
    discipline: MetropolisDiscipline = "science",
  ) {
    return proposeMetropolisChange(state, proposalId, discipline, to, source);
  }

  it("rejects pending, unchanged, and illegal permanent transfers", () => {
    const pending = metropolisState();
    pending.metropolises.pendingProposal = {
      id: proposalId,
      discipline: "science",
      source: "correction",
      from: null,
      to: null,
      changes: [],
      summary: "pending",
    };
    expect(propose(pending, null)).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });

    const permanent = metropolisState(
      [player(PLAYER_A, 5), player(PLAYER_B, 5)],
      { holderId: PLAYER_A, status: "permanent" },
    );
    expect(
      propose(permanent, { holderId: PLAYER_A, status: "permanent" }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_COMMAND" } });
    expect(
      propose(permanent, { holderId: PLAYER_B, status: "permanent" }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });
  });

  it("rejects unknown and under-qualified holders", () => {
    expect(
      propose(metropolisState(), {
        holderId: UNKNOWN_PLAYER,
        status: "temporary",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });
    expect(
      propose(metropolisState(), {
        holderId: PLAYER_A,
        status: "temporary",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });
    expect(
      propose(metropolisState([player(PLAYER_A, 4)]), {
        holderId: PLAYER_A,
        status: "permanent",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });
  });

  it("describes assignment, removal, permanence, and correction transfer", () => {
    const assigned = propose(metropolisState([player(PLAYER_A, 4)]), {
      holderId: PLAYER_A,
      status: "temporary",
    });
    expect(assigned).toMatchObject({
      ok: true,
      value: {
        summary: "Assign the science metropolis as temporary.",
        changes: [{ playerId: PLAYER_A, scoreDelta: 2 }],
      },
    });

    const temporary = metropolisState(
      [player(PLAYER_A, 4), player(PLAYER_B, 4)],
      { holderId: PLAYER_A, status: "temporary" },
    );
    expect(propose(temporary, null, "correction")).toMatchObject({
      ok: true,
      value: {
        summary: "Remove the science metropolis from its recorded holder.",
      },
    });
    expect(
      propose(
        temporary,
        { holderId: PLAYER_A, status: "permanent" },
        "correction",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_METROPOLIS_STATE" },
    });

    const qualified = metropolisState(
      [player(PLAYER_A, 5), player(PLAYER_B, 5)],
      { holderId: PLAYER_A, status: "temporary" },
    );
    expect(
      propose(qualified, { holderId: PLAYER_A, status: "permanent" }),
    ).toMatchObject({
      ok: true,
      value: {
        summary: "Make the science metropolis permanent.",
        changes: [],
      },
    });
    expect(
      propose(
        qualified,
        { holderId: PLAYER_B, status: "permanent" },
        "correction",
      ),
    ).toMatchObject({
      ok: true,
      value: {
        summary: "Transfer the science metropolis and its two public points.",
        changes: [
          { playerId: PLAYER_A, scoreDelta: -2 },
          { playerId: PLAYER_B, scoreDelta: 2 },
        ],
      },
    });
  });
});

describe("thematic scheduling edge cases", () => {
  const occurrenceId = asEventOccurrenceId("occurrence");

  function schedule(state: ThematicEventState, completedTurns = 3) {
    return scheduleThematicEvent(
      state,
      completedTurns,
      2,
      () => 0,
      REVISION,
      occurrenceId,
    );
  }

  it("does nothing when disabled and rejects pending or empty enabled state", () => {
    const disabled = thematicState({ enabled: false });
    expect(schedule(disabled)).toEqual({
      ok: true,
      value: { state: disabled, event: null },
    });
    const pending = thematicState();
    pending.pendingEvent = {
      occurrenceId,
      eventId: pending.enabledEvents[0]!.id,
      contentVersion: 1,
      title: "Pending",
      instruction: "Pending",
      triggeredAtCompletedTurn: 2,
      acknowledged: false,
    };
    expect(schedule(pending)).toMatchObject({
      ok: false,
      error: { code: "INVALID_THEMATIC_STATE" },
    });
    expect(schedule(thematicState({ enabledEvents: [] }))).toMatchObject({
      ok: false,
      error: { code: "INVALID_THEMATIC_STATE" },
    });
  });

  it("propagates corrupt trigger and event deck failures", () => {
    const corruptTrigger = thematicState();
    corruptTrigger.triggerBag = { ...corruptTrigger.triggerBag, cursor: -1 };
    expect(schedule(corruptTrigger)).toMatchObject({
      ok: false,
      error: { code: "DECK_STATE_CORRUPT" },
    });

    const corruptEvent = thematicState({ deferredTrigger: true });
    corruptEvent.eventDeck = { ...corruptEvent.eventDeck, cursor: -1 };
    expect(schedule(corruptEvent)).toMatchObject({
      ok: false,
      error: { code: "DECK_STATE_CORRUPT" },
    });
  });

  it("clears a non-trigger and emits deferred eligible content", () => {
    const noTrigger = thematicState({ deferredTrigger: false });
    noTrigger.triggerBag = {
      ...noTrigger.triggerBag,
      cursor: 0,
      order: noTrigger.triggerBag.order.map(() => ({ trigger: false })),
    };
    expect(schedule(noTrigger)).toMatchObject({
      ok: true,
      value: { event: null, state: { deferredTrigger: false } },
    });

    const deferred = thematicState({ deferredTrigger: true });
    const result = schedule(deferred);
    expect(result).toMatchObject({
      ok: true,
      value: {
        event: {
          occurrenceId,
          triggeredAtCompletedTurn: 3,
          acknowledged: false,
        },
        state: { deferredTrigger: false, pendingEvent: { occurrenceId } },
      },
    });
  });

  it("rejects event deck IDs that do not reference enabled content", () => {
    const unknown = thematicState({ deferredTrigger: true });
    unknown.eventDeck = {
      ...unknown.eventDeck,
      order: [asEventId("missing"), unknown.enabledEvents[1]!.id],
    };
    expect(schedule(unknown)).toMatchObject({
      ok: false,
      error: { code: "INVALID_THEMATIC_STATE" },
    });
  });

  it("handles a one-item event deck without trying to avoid its repeat", () => {
    const only = definition("only");
    const deck = createThematicEventDeck([only], () => 0, REVISION, only.id);
    expect(deck.order).toEqual([only.id]);
  });

  it("rebuilds exhausted trigger and event decks at the next cycle", () => {
    const exhaustedTrigger = thematicState();
    exhaustedTrigger.triggerBag = {
      ...exhaustedTrigger.triggerBag,
      cursor: exhaustedTrigger.triggerBag.order.length,
    };
    const triggerResult = schedule(exhaustedTrigger);
    expect(triggerResult).toMatchObject({
      ok: true,
      value: { state: { triggerBag: { cycle: 2, cursor: 1 } } },
    });

    const exhaustedEvent = thematicState({ deferredTrigger: true });
    exhaustedEvent.eventDeck = {
      ...exhaustedEvent.eventDeck,
      cursor: exhaustedEvent.eventDeck.order.length,
    };
    const eventResult = schedule(exhaustedEvent);
    expect(eventResult).toMatchObject({
      ok: true,
      value: {
        event: { occurrenceId },
        state: { eventDeck: { cycle: 2, cursor: 1 } },
      },
    });
  });

  it("leaves a corrupt duplicate-ID deck unchanged when no replacement exists", () => {
    const duplicate = definition("duplicate");
    const deck = createThematicEventDeck(
      [duplicate, { ...duplicate }],
      () => 0,
      REVISION,
      duplicate.id,
    );
    expect(deck.order).toEqual([duplicate.id, duplicate.id]);
  });
});
