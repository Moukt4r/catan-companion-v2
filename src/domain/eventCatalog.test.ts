import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMATIC_EVENTS } from "./rules";
import { WORLD_EVENTS_CATALOG, type WorldEventTone } from "./worldEvents";

describe("world events catalog", () => {
  it("has between 18 and 40 events", () => {
    expect(WORLD_EVENTS_CATALOG.length).toBeGreaterThanOrEqual(18);
    expect(WORLD_EVENTS_CATALOG.length).toBeLessThanOrEqual(40);
  });

  it("has unique IDs", () => {
    const ids = WORLD_EVENTS_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty titles and instructions", () => {
    for (const event of WORLD_EVENTS_CATALOG) {
      expect(event.title.trim()).not.toBe("");
      expect(event.instruction.trim()).not.toBe("");
    }
  });

  it("has valid metadata on every event", () => {
    const validTones: WorldEventTone[] = ["boon", "mixed", "setback"];
    const validImpacts = [1, 2, 3];
    const validCategories = [
      "economy",
      "military",
      "diplomacy",
      "nature",
      "society",
    ];
    const validScopes = ["all", "active-player", "conditional"];
    const validDurations = [
      "immediate",
      "rest-of-turn",
      "full-round",
      "until-next-occurrence",
      "until-resolved",
    ];

    for (const event of WORLD_EVENTS_CATALOG) {
      expect(validTones).toContain(event.tone);
      expect(validImpacts).toContain(event.impact);
      expect(validCategories).toContain(event.category);
      expect(validScopes).toContain(event.scope);
      expect(validDurations).toContain(event.duration);
      expect(event.compatibility).toHaveProperty("twoPlayer");
    }
  });

  it("has roughly balanced tone distribution", () => {
    const counts: Record<WorldEventTone, number> = {
      boon: 0,
      mixed: 0,
      setback: 0,
    };
    for (const event of WORLD_EVENTS_CATALOG) {
      counts[event.tone]++;
    }
    // Proportional rather than absolute: the catalog grows over time, and a
    // fixed ceiling would fail on size alone while the mix stayed balanced.
    // No tone may fall below 15% or take more than half the deck.
    const total = WORLD_EVENTS_CATALOG.length;
    for (const tone of ["boon", "mixed", "setback"] as const) {
      expect(counts[tone] / total).toBeGreaterThanOrEqual(0.15);
      expect(counts[tone] / total).toBeLessThanOrEqual(0.5);
    }
  });

  it("has pyramid impact distribution (more low than high)", () => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const event of WORLD_EVENTS_CATALOG) {
      counts[event.impact]++;
    }
    expect(counts[1] + counts[2]).toBeGreaterThan(counts[3]);
  });

  it("all IDs start with we- prefix", () => {
    for (const event of WORLD_EVENTS_CATALOG) {
      expect(event.id).toMatch(/^we-/);
    }
  });

  it("phrases catch-up events against public victory points", () => {
    // Progress cards can hide victory points, so "fewest" is only unambiguous
    // at the table if it refers to the public total the app already shows.
    const catchUp = WORLD_EVENTS_CATALOG.filter((event) =>
      /fewest|the most/.test(event.instruction),
    );
    expect(catchUp.length).toBeGreaterThan(0);
    for (const event of catchUp) {
      expect(event.instruction).toMatch(/public victory points/);
    }
  });

  it("pairs every improvement track with both a leader and a laggard event", () => {
    // Investing in a track and neglecting it should both stay live: each
    // discipline needs an event for players at level 2+ and one for the rest.
    for (const track of ["science", "trade", "politics"] as const) {
      const matching = WORLD_EVENTS_CATALOG.filter((event) =>
        event.instruction.includes(track),
      );
      expect(
        matching.some((event) =>
          event.instruction.includes(`${track} at level 2 or higher`),
        ),
        `${track} needs an event rewarding investment`,
      ).toBe(true);
      expect(
        matching.some((event) =>
          event.instruction.includes(`${track} below level 2`),
        ),
        `${track} needs an event helping players who have not invested`,
      ).toBe(true);
    }
  });
});

describe("built-in thematic events (projected)", () => {
  it("maps world events to ThematicEventDefinition shape", () => {
    expect(BUILT_IN_THEMATIC_EVENTS.length).toBe(WORLD_EVENTS_CATALOG.length);
    for (const def of BUILT_IN_THEMATIC_EVENTS) {
      expect(def).toHaveProperty("id");
      expect(def).toHaveProperty("contentVersion");
      expect(def).toHaveProperty("title");
      expect(def).toHaveProperty("instruction");
      // v2+: should carry metadata through to persistence
      expect(def).toHaveProperty("tone");
      expect(def).toHaveProperty("impact");
      expect(def).toHaveProperty("category");
      expect(def).toHaveProperty("scope");
      expect(def).toHaveProperty("duration");
      expect(def).toHaveProperty("compatibility");
    }
  });

  it("has unique IDs matching the world catalog", () => {
    const worldIds = WORLD_EVENTS_CATALOG.map((e) => e.id);
    const thematicIds = BUILT_IN_THEMATIC_EVENTS.map((e) => e.id);
    expect(thematicIds).toEqual(worldIds);
  });
});
