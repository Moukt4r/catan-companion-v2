/**
 * Tests for the percent-based World Event frequency slider.
 *
 * The slider replaced the coarse subtle/standard/lively cadence. Two properties
 * matter and are asserted here:
 *  - Truthfulness: a bag of 100 slots carries exactly `percent` triggers, and
 *    the turn cooldown relaxes so high percentages are actually reachable.
 *  - Even spread: triggers are stratified rather than plainly shuffled, so a
 *    long run of turns never clumps every event into one stretch.
 */
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMATIC_EVENTS,
  scheduleThematicEvent,
  THEMATIC_TRIGGER_BAG_SLOTS,
  clampNumberedReshuffleThreshold,
  clampThematicPercent,
  createThematicState,
  createTriggerBag,
  thematicCooldownTurns,
} from "./index";
import { asRevisionId } from "./ids";

const revision = asRevisionId("frequency-revision");

/** Deterministic bounded source that always picks the middle of a range. */
const midpoint = (upperExclusive: number) => Math.floor(upperExclusive / 2);

describe("clampThematicPercent", () => {
  it("keeps integer percents within 0-100", () => {
    expect(clampThematicPercent(0)).toBe(0);
    expect(clampThematicPercent(37)).toBe(37);
    expect(clampThematicPercent(100)).toBe(100);
  });

  it("rounds fractional input and clamps out-of-range values", () => {
    expect(clampThematicPercent(12.4)).toBe(12);
    expect(clampThematicPercent(12.6)).toBe(13);
    expect(clampThematicPercent(-25)).toBe(0);
    expect(clampThematicPercent(250)).toBe(100);
  });

  it("treats non-finite input as off", () => {
    // Non-finite values are treated as "off" rather than guessed at, so a
    // corrupt save can never silently maximise the event rate.
    expect(clampThematicPercent(Number.NaN)).toBe(0);
    expect(clampThematicPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("clampNumberedReshuffleThreshold", () => {
  it("keeps supported thresholds and clamps the rest", () => {
    expect(clampNumberedReshuffleThreshold(0)).toBe(0);
    expect(clampNumberedReshuffleThreshold(4)).toBe(4);
    expect(clampNumberedReshuffleThreshold(12)).toBe(12);
    expect(clampNumberedReshuffleThreshold(99)).toBe(12);
    expect(clampNumberedReshuffleThreshold(-3)).toBe(0);
    expect(clampNumberedReshuffleThreshold(3.7)).toBe(4);
    expect(clampNumberedReshuffleThreshold(Number.NaN)).toBe(0);
  });
});

describe("thematicCooldownTurns", () => {
  it("relaxes the gap as the requested frequency rises", () => {
    expect(thematicCooldownTurns(5)).toBe(2);
    expect(thematicCooldownTurns(24)).toBe(2);
    expect(thematicCooldownTurns(25)).toBe(1);
    expect(thematicCooldownTurns(49)).toBe(1);
    expect(thematicCooldownTurns(50)).toBe(0);
    expect(thematicCooldownTurns(100)).toBe(0);
  });

  it("never blocks a 100% slider from firing every eligible turn", () => {
    // A fixed 2-turn gap would cap 100% at one event every third turn.
    expect(thematicCooldownTurns(100)).toBe(0);
  });
});

describe("createTriggerBag", () => {
  it("always allocates exactly 100 slots", () => {
    for (const percent of [0, 1, 8, 37, 99, 100]) {
      const bag = createTriggerBag(percent, midpoint, revision);
      expect(bag.order).toHaveLength(THEMATIC_TRIGGER_BAG_SLOTS);
    }
  });

  it("carries exactly `percent` triggers for every whole percent", () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const bag = createTriggerBag(percent, midpoint, revision);
      const triggers = bag.order.filter((token) => token.trigger).length;
      expect(triggers).toBe(percent);
    }
  });

  it("spreads triggers evenly instead of clumping them", () => {
    const bag = createTriggerBag(10, midpoint, revision);
    const positions = bag.order.flatMap((token, index) =>
      token.trigger ? [index] : [],
    );
    expect(positions).toHaveLength(10);
    // Stratified placement puts one trigger in each 10-slot block.
    for (const [block, position] of positions.entries()) {
      expect(position).toBeGreaterThanOrEqual(block * 10);
      expect(position).toBeLessThan((block + 1) * 10);
    }
  });

  it("fills every slot at 100% and no slot at 0%", () => {
    const full = createTriggerBag(100, midpoint, revision);
    expect(full.order.every((token) => token.trigger)).toBe(true);

    const off = createTriggerBag(0, midpoint, revision);
    expect(off.order.some((token) => token.trigger)).toBe(false);
  });

  it("clamps out-of-range percents", () => {
    const over = createTriggerBag(500, midpoint, revision);
    expect(over.order.filter((token) => token.trigger)).toHaveLength(100);

    const under = createTriggerBag(-10, midpoint, revision);
    expect(under.order.filter((token) => token.trigger)).toHaveLength(0);
  });

  it("records the requested cycle", () => {
    const bag = createTriggerBag(8, midpoint, revision, 4);
    expect(bag.cycle).toBe(4);
    expect(bag.cursor).toBe(0);
  });
});

describe("createThematicState frequency wiring", () => {
  const events = [
    {
      id: "we-test" as never,
      contentVersion: 1,
      title: "Test",
      instruction: "Test instruction",
    },
  ];

  it("builds a bag matching the configured percent", () => {
    const state = createThematicState(true, 37, events, midpoint, revision);
    expect(state.percent).toBe(37);
    expect(
      state.triggerBag.order.filter((token) => token.trigger),
    ).toHaveLength(37);
  });

  it("clamps an out-of-range percent when building state", () => {
    const state = createThematicState(true, 250, events, midpoint, revision);
    expect(state.percent).toBe(100);
    expect(
      state.triggerBag.order.filter((token) => token.trigger),
    ).toHaveLength(100);
  });
});

describe("scheduleThematicEvent frequency behaviour", () => {
  const events = BUILT_IN_THEMATIC_EVENTS.slice(0, 6).map((event) => ({
    ...event,
  }));

  function stateAt(percent: number) {
    return createThematicState(true, percent, events, midpoint, revision);
  }

  it("never triggers when the slider is at zero", () => {
    const state = stateAt(0);
    for (let turn = 4; turn < 40; turn += 1) {
      const result = scheduleThematicEvent(
        state,
        turn,
        4,
        midpoint,
        revision,
        `occurrence-${turn}` as never,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.event).toBeNull();
    }
  });

  it("triggers on every eligible turn at 100%", () => {
    let state = stateAt(100);
    let triggered = 0;
    for (let turn = 4; turn < 24; turn += 1) {
      const result = scheduleThematicEvent(
        state,
        turn,
        4,
        midpoint,
        revision,
        `full-${turn}` as never,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      if (result.value.event !== null) {
        triggered += 1;
        // Clear the pending event so the next turn can schedule again.
        state = { ...result.value.state, pendingEvent: null };
      } else {
        state = result.value.state;
      }
    }
    // With no cooldown at 100%, every eligible turn fires.
    expect(triggered).toBe(20);
  });

  it("respects the relaxed cooldown at a mid-range percent", () => {
    // At 25% the gap drops to a single turn, so two events can land close
    // together without the scheduler silently suppressing one.
    expect(thematicCooldownTurns(25)).toBe(1);

    let state = stateAt(100);
    const first = scheduleThematicEvent(
      state,
      8,
      4,
      midpoint,
      revision,
      "gap-first" as never,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.event).not.toBeNull();

    state = { ...first.value.state, pendingEvent: null };
    const second = scheduleThematicEvent(
      state,
      9,
      4,
      midpoint,
      revision,
      "gap-second" as never,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.event).not.toBeNull();
  });
});

describe("seasonal draw guardrails", () => {
  const seasonConfig = {
    enabled: true,
    roundsPerSeason: 3,
    startingSeason: "spring",
  } as const;

  /** Seasonal selection needs more than one category to be in play. */
  function seasonalState(percent = 100) {
    const events = BUILT_IN_THEMATIC_EVENTS.filter((event) =>
      ["nature", "economy", "military"].includes(event.category ?? ""),
    ).map((event) => ({ ...event }));
    return createThematicState(true, percent, events, midpoint, revision);
  }

  it("draws through the seasonal path when a season is active", () => {
    const state = seasonalState();
    const result = scheduleThematicEvent(
      state,
      8,
      4,
      midpoint,
      revision,
      "seasonal-ok" as never,
      seasonConfig,
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event).not.toBeNull();
  });

  it("rejects a corrupt seasonal deck cursor", () => {
    const base = seasonalState();
    const corrupt = {
      ...base,
      eventDeck: { ...base.eventDeck, cursor: -1 },
    };
    const result = scheduleThematicEvent(
      corrupt,
      8,
      4,
      midpoint,
      revision,
      "seasonal-corrupt" as never,
      seasonConfig,
      3,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DECK_STATE_CORRUPT");
  });

  it("rejects a seasonal deck referencing unknown content", () => {
    const base = seasonalState();
    const corrupt = {
      ...base,
      eventDeck: {
        ...base.eventDeck,
        cursor: 0,
        order: ["not-a-real-event" as never, ...base.eventDeck.order],
      },
    };
    const result = scheduleThematicEvent(
      corrupt,
      8,
      4,
      midpoint,
      revision,
      "seasonal-unknown" as never,
      seasonConfig,
      3,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_THEMATIC_STATE");
  });

  it("starts a fresh seasonal cycle when the deck is exhausted", () => {
    const base = seasonalState();
    const exhausted = {
      ...base,
      eventDeck: {
        ...base.eventDeck,
        cursor: base.eventDeck.order.length,
      },
      previousEventId: base.eventDeck.order.at(-1) ?? null,
    };
    const result = scheduleThematicEvent(
      exhausted,
      8,
      4,
      midpoint,
      revision,
      "seasonal-cycle" as never,
      seasonConfig,
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.eventDeck.cycle).toBe(base.eventDeck.cycle + 1);
  });
});
