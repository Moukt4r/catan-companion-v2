import { describe, expect, it } from "vitest";
import {
  WORLD_EVENTS_CATALOG,
  createBalancedWorldEventOrder,
  isWorldEventExpired,
  worldEventTurnsRemaining,
  pruneActiveEvents,
  createActiveWorldEvent,
  createActiveWorldEventFromDefinition,
  resolveActiveEvent,
  type ActiveWorldEvent,
} from "./worldEvents";
import type { EventId, ThematicEventDefinition } from "./types";

// Deterministic RNG for tests
function seededRng(seed: number) {
  let s = seed;
  return (upperExclusive: number): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % upperExclusive;
  };
}

describe("createBalancedWorldEventOrder", () => {
  it("returns all event IDs exactly once", () => {
    const order = createBalancedWorldEventOrder(
      WORLD_EVENTS_CATALOG,
      seededRng(42),
      null,
    );
    expect(order.length).toBe(WORLD_EVENTS_CATALOG.length);
    expect(new Set(order).size).toBe(order.length);
    for (const event of WORLD_EVENTS_CATALOG) {
      expect(order).toContain(event.id);
    }
  });

  it("prevents the previous event from appearing first", () => {
    const lastId = WORLD_EVENTS_CATALOG[0]!.id;
    for (let seed = 0; seed < 50; seed++) {
      const order = createBalancedWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        lastId,
      );
      expect(order[0]).not.toBe(lastId);
    }
  });

  it("does not have more than 2 consecutive same-tone events", () => {
    const metaById = new Map(WORLD_EVENTS_CATALOG.map((e) => [e.id, e]));
    for (let seed = 0; seed < 100; seed++) {
      const order = createBalancedWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
      );
      for (let i = 2; i < order.length; i++) {
        const t0 = metaById.get(order[i - 2]!)!.tone;
        const t1 = metaById.get(order[i - 1]!)!.tone;
        const t2 = metaById.get(order[i]!)!.tone;
        if (t0 === t1 && t1 === t2) {
          // This should not happen
          expect(
            `seed=${seed} index=${i}: three consecutive ${t2} events`,
          ).toBe("no violation");
        }
      }
    }
  });

  it("does not have more than 1 consecutive impact-3 event", () => {
    const metaById = new Map(WORLD_EVENTS_CATALOG.map((e) => [e.id, e]));
    for (let seed = 0; seed < 100; seed++) {
      const order = createBalancedWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        null,
      );
      for (let i = 1; i < order.length; i++) {
        const imp0 = metaById.get(order[i - 1]!)!.impact;
        const imp1 = metaById.get(order[i]!)!.impact;
        if (imp0 === 3 && imp1 === 3) {
          expect(
            `seed=${seed} index=${i}: two consecutive impact-3 events`,
          ).toBe("no violation");
        }
      }
    }
  });

  it("handles single-event catalog", () => {
    const single = [WORLD_EVENTS_CATALOG[0]!];
    const order = createBalancedWorldEventOrder(single, seededRng(1), null);
    expect(order).toEqual([single[0]!.id]);
  });

  it("handles empty catalog", () => {
    const order = createBalancedWorldEventOrder([], seededRng(1), null);
    expect(order).toEqual([]);
  });
});

describe("isWorldEventExpired", () => {
  it("immediate events always expire", () => {
    const event: ActiveWorldEvent = {
      occurrenceId: "occ-1",
      contentVersion: 1,
      eventId: "we-good-harvest" as EventId,
      title: "Good Harvest",
      instruction: "test",
      tone: "boon",
      impact: 1,
      category: "economy",
      scope: "all",
      duration: "immediate",
      compatibility: { twoPlayer: true },
      activeRound: null,
      triggeredAtCompletedTurn: 5,
      activated: true,
    };
    expect(isWorldEventExpired(event, 5, 3)).toBe(true);
  });

  it("rest-of-turn events expire after the triggering turn", () => {
    const event: ActiveWorldEvent = {
      occurrenceId: "occ-1",
      contentVersion: 1,
      eventId: "we-market-day" as EventId,
      title: "Market Day",
      instruction: "test",
      tone: "boon",
      impact: 2,
      category: "economy",
      scope: "active-player",
      duration: "rest-of-turn",
      compatibility: { twoPlayer: true },
      activeRound: null,
      triggeredAtCompletedTurn: 5,
      activated: true,
    };
    expect(isWorldEventExpired(event, 5, 3)).toBe(false);
    expect(isWorldEventExpired(event, 6, 3)).toBe(true);
  });

  it("full-round events last one turn per player, not until the round counter ticks", () => {
    const event: ActiveWorldEvent = {
      occurrenceId: "occ-1",
      contentVersion: 1,
      eventId: "we-trade-winds" as EventId,
      title: "Trade Winds",
      instruction: "test",
      tone: "boon",
      impact: 2,
      category: "economy",
      scope: "all",
      duration: "full-round",
      compatibility: { twoPlayer: true },
      activeRound: 3,
      triggeredAtCompletedTurn: 5,
      activated: true,
    };
    // Drawn with 5 turns complete in a 3-player game, so turns 6, 7 and 8 are
    // played under it. It survives partway through and expires once the third
    // turn completes, regardless of where the round boundary falls.
    expect(isWorldEventExpired(event, 6, 3)).toBe(false);
    expect(isWorldEventExpired(event, 7, 3)).toBe(false);
    expect(isWorldEventExpired(event, 8, 3)).toBe(true);
  });

  it("deferred full-round events are not expired", () => {
    const event: ActiveWorldEvent = {
      occurrenceId: "occ-1",
      contentVersion: 1,
      eventId: "we-trade-winds" as EventId,
      title: "Trade Winds",
      instruction: "test",
      tone: "boon",
      impact: 2,
      category: "economy",
      scope: "all",
      duration: "full-round",
      compatibility: { twoPlayer: true },
      activeRound: null,
      triggeredAtCompletedTurn: 5,
      activated: false,
    };
    expect(isWorldEventExpired(event, 10, 3)).toBe(false);
  });

  it("until-next-occurrence and until-resolved events do not expire by time", () => {
    const event: ActiveWorldEvent = {
      occurrenceId: "occ-1",
      contentVersion: 1,
      eventId: "we-earthquake" as EventId,
      title: "Earthquake",
      instruction: "test",
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
    expect(isWorldEventExpired(event, 100, 3)).toBe(false);
    expect(
      isWorldEventExpired(
        { ...event, duration: "until-next-occurrence" },
        100,
        3,
      ),
    ).toBe(false);
  });
});

describe("full-round activation", () => {
  it("activates a full-round event immediately at its own round", () => {
    const definition = WORLD_EVENTS_CATALOG.find(
      (event) => event.duration === "full-round",
    );
    expect(definition).toBeDefined();
    if (!definition) return;

    // Events used to sit dormant until the next round boundary, which meant
    // the table read an instruction that was not yet in force.
    const active = createActiveWorldEvent("occ-1", definition, 5, 3);
    expect(active).not.toBeNull();
    expect(active?.activated).toBe(true);
    expect(active?.activeRound).toBe(3);
  });

  it("expires a full-round event once every player has had a turn", () => {
    const definition = WORLD_EVENTS_CATALOG.find(
      (event) => event.duration === "full-round",
    );
    if (!definition) return;
    const active = createActiveWorldEvent("occ-2", definition, 5, 3);
    if (!active) return;

    expect(isWorldEventExpired(active, 7, 3)).toBe(false);
    expect(isWorldEventExpired(active, 8, 3)).toBe(true);
  });

  it("counts down the turns remaining on a full-round event", () => {
    const definition = WORLD_EVENTS_CATALOG.find(
      (event) => event.duration === "full-round",
    );
    if (!definition) return;
    const active = createActiveWorldEvent("occ-3", definition, 5, 3);
    if (!active) return;

    // Four players means four turns under the event, ticking down each turn.
    expect(worldEventTurnsRemaining(active, 5, 4)).toBe(4);
    expect(worldEventTurnsRemaining(active, 6, 4)).toBe(3);
    expect(worldEventTurnsRemaining(active, 8, 4)).toBe(1);
    expect(worldEventTurnsRemaining(active, 9, 4)).toBe(0);
  });
});

describe("pruneActiveEvents", () => {
  it("removes expired events and until-next-occurrence on new event", () => {
    const events: ActiveWorldEvent[] = [
      {
        occurrenceId: "occ-1",
        contentVersion: 1,
        eventId: "we-market-day" as EventId,
        title: "Market Day",
        instruction: "test",
        tone: "boon",
        impact: 2,
        category: "economy",
        scope: "active-player",
        duration: "rest-of-turn",
        compatibility: { twoPlayer: true },
        activeRound: null,
        triggeredAtCompletedTurn: 3,
        activated: true,
      },
      {
        occurrenceId: "occ-2",
        contentVersion: 1,
        eventId: "we-test" as EventId,
        title: "Test",
        instruction: "test",
        tone: "mixed",
        impact: 1,
        category: "economy",
        scope: "all",
        duration: "until-next-occurrence",
        compatibility: { twoPlayer: true },
        activeRound: null,
        triggeredAtCompletedTurn: 2,
        activated: true,
      },
    ];
    const result = pruneActiveEvents(events, 5, 3, true);
    // Both should be removed: first expired, second because new event fires
    expect(result.length).toBe(0);
  });
});

describe("createActiveWorldEvent", () => {
  it("returns null for immediate events", () => {
    const event = WORLD_EVENTS_CATALOG.find((e) => e.duration === "immediate")!;
    const result = createActiveWorldEvent("occ-1", event, 5, 2);
    expect(result).toBeNull();
  });

  it("creates an immediately active event for full-round duration", () => {
    const event = WORLD_EVENTS_CATALOG.find(
      (e) => e.duration === "full-round",
    )!;
    // Full-round events take effect in the round they are drawn, not the next.
    const result = createActiveWorldEvent("occ-1", event, 5, 2);
    expect(result).not.toBeNull();
    expect(result!.activated).toBe(true);
    expect(result!.activeRound).toBe(2);
    expect(result!.duration).toBe("full-round");
  });

  it("creates an active event for rest-of-turn duration", () => {
    const event = WORLD_EVENTS_CATALOG.find(
      (e) => e.duration === "rest-of-turn",
    )!;
    const result = createActiveWorldEvent("occ-1", event, 5, 2);
    expect(result).not.toBeNull();
    expect(result!.activated).toBe(true);
    expect(result!.duration).toBe("rest-of-turn");
  });

  it("includes full content snapshot in active event", () => {
    const event = WORLD_EVENTS_CATALOG.find(
      (e) => e.duration === "full-round",
    )!;
    const result = createActiveWorldEvent("occ-1", event, 5, 2);
    expect(result).not.toBeNull();
    expect(result!.title).toBe(event.title);
    expect(result!.instruction).toBe(event.instruction);
    expect(result!.category).toBe(event.category);
    expect(result!.scope).toBe(event.scope);
    expect(result!.compatibility).toEqual(event.compatibility);
  });

  it("uses persisted metadata and fills optional metadata defaults", () => {
    const definition: ThematicEventDefinition = {
      id: "custom-event" as EventId,
      contentVersion: 3,
      title: "Custom",
      instruction: "Keep this active.",
      tone: "mixed",
      duration: "until-resolved",
    };

    const result = createActiveWorldEventFromDefinition(
      "custom-occurrence",
      definition,
      WORLD_EVENTS_CATALOG,
      4,
      2,
    );

    expect(result).toMatchObject({
      contentVersion: 3,
      impact: 1,
      category: "society",
      scope: "all",
      compatibility: { twoPlayer: true },
    });
  });

  it("falls back to the catalog for legacy definitions and skips unknown ones", () => {
    const catalogEvent = WORLD_EVENTS_CATALOG.find(
      (event) => event.duration !== "immediate",
    )!;
    const legacy: ThematicEventDefinition = {
      id: catalogEvent.id,
      contentVersion: catalogEvent.contentVersion,
      title: catalogEvent.title,
      instruction: catalogEvent.instruction,
    };
    const unknown: ThematicEventDefinition = {
      ...legacy,
      id: "unknown-legacy-event" as EventId,
    };

    expect(
      createActiveWorldEventFromDefinition(
        "legacy-occurrence",
        legacy,
        WORLD_EVENTS_CATALOG,
        4,
        2,
      ),
    ).toMatchObject({ eventId: catalogEvent.id });
    expect(
      createActiveWorldEventFromDefinition(
        "unknown-occurrence",
        unknown,
        WORLD_EVENTS_CATALOG,
        4,
        2,
      ),
    ).toBeNull();
  });
});

describe("resolveActiveEvent", () => {
  const makeEvent = (
    overrides: Partial<ActiveWorldEvent> = {},
  ): ActiveWorldEvent => ({
    occurrenceId: "occ-1",
    contentVersion: 1,
    eventId: "we-earthquake" as EventId,
    title: "Earthquake",
    instruction: "test",
    tone: "setback",
    impact: 2,
    category: "nature",
    scope: "all",
    duration: "until-resolved",
    compatibility: { twoPlayer: true },
    activeRound: null,
    triggeredAtCompletedTurn: 5,
    activated: true,
    ...overrides,
  });

  it("resolves an until-resolved event and returns remaining", () => {
    const events = [
      makeEvent(),
      makeEvent({ occurrenceId: "occ-2", duration: "rest-of-turn" }),
    ];
    const result = resolveActiveEvent(events, "occ-1");
    expect(result).not.toBeNull();
    expect(result!.resolved.occurrenceId).toBe("occ-1");
    expect(result!.remaining).toHaveLength(1);
    expect(result!.remaining[0]!.occurrenceId).toBe("occ-2");
  });

  it("returns null for non-until-resolved event", () => {
    const events = [makeEvent({ duration: "rest-of-turn" })];
    expect(resolveActiveEvent(events, "occ-1")).toBeNull();
  });

  it("returns null for unknown occurrenceId", () => {
    const events = [makeEvent()];
    expect(resolveActiveEvent(events, "occ-999")).toBeNull();
  });
});

describe("impact-3 anti-clump across deck-cycle boundary", () => {
  it("does not start new cycle with impact-3 when previous was impact-3", () => {
    const metaById = new Map(WORLD_EVENTS_CATALOG.map((e) => [e.id, e]));
    // Find an impact-3 event to use as previous
    const impact3Event = WORLD_EVENTS_CATALOG.find((e) => e.impact === 3)!;
    for (let seed = 0; seed < 100; seed++) {
      const order = createBalancedWorldEventOrder(
        WORLD_EVENTS_CATALOG,
        seededRng(seed),
        impact3Event.id,
      );
      const firstMeta = metaById.get(order[0]!)!;
      expect(firstMeta.impact).not.toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

import { validateActiveEvents } from "./worldEvents";

describe("validateActiveEvents", () => {
  const valid: ActiveWorldEvent = {
    occurrenceId: "occ-v1",
    contentVersion: 1,
    eventId: "we-earthquake" as EventId,
    title: "Earthquake",
    instruction: "Shake things up",
    tone: "setback",
    impact: 2,
    category: "nature",
    scope: "all",
    duration: "until-resolved",
    compatibility: { twoPlayer: true },
    activeRound: null,
    triggeredAtCompletedTurn: 3,
    activated: true,
  };

  it("returns no errors for valid active events", () => {
    expect(validateActiveEvents([valid])).toEqual([]);
  });

  it("detects duplicate occurrenceIds", () => {
    const errs = validateActiveEvents([valid, { ...valid }]);
    expect(errs.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects immediate events in active list", () => {
    const errs = validateActiveEvents([{ ...valid, duration: "immediate" }]);
    expect(errs.some((e) => e.includes("immediate"))).toBe(true);
  });

  it("rejects activated full-round without activeRound", () => {
    const errs = validateActiveEvents([
      { ...valid, duration: "full-round", activated: true, activeRound: null },
    ]);
    expect(errs.some((e) => e.includes("activeRound"))).toBe(true);
  });

  it("rejects an active full-round event without activeRound", () => {
    const errs = validateActiveEvents([
      { ...valid, duration: "full-round", activated: true, activeRound: null },
    ]);
    expect(errs.some((e) => e.includes("activeRound"))).toBe(true);
  });

  it("rejects missing title", () => {
    const errs = validateActiveEvents([{ ...valid, title: "" }]);
    expect(errs.some((e) => e.includes("title"))).toBe(true);
  });

  it("rejects invalid contentVersion", () => {
    const errs = validateActiveEvents([{ ...valid, contentVersion: 0 }]);
    expect(errs.some((e) => e.includes("contentVersion"))).toBe(true);
  });

  it("reports every corrupted metadata field and a missing instruction", () => {
    const corrupted = {
      ...valid,
      tone: "chaotic",
      impact: 9,
      category: "ocean",
      scope: "nobody",
      duration: "forever",
      instruction: "",
    } as unknown as ActiveWorldEvent;

    const errors = validateActiveEvents([corrupted]);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("invalid tone"),
        expect.stringContaining("invalid impact"),
        expect.stringContaining("invalid category"),
        expect.stringContaining("invalid scope"),
        expect.stringContaining("invalid duration"),
        expect.stringContaining("missing instruction"),
      ]),
    );
  });
});
