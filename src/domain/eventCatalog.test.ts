import { describe, expect, it } from "vitest";
import { BUILT_IN_THEMATIC_EVENTS } from "./rules";
import { WORLD_EVENTS_CATALOG, type WorldEventTone } from "./worldEvents";

describe("world events catalog", () => {
  it("has between 18 and 24 events", () => {
    expect(WORLD_EVENTS_CATALOG.length).toBeGreaterThanOrEqual(18);
    expect(WORLD_EVENTS_CATALOG.length).toBeLessThanOrEqual(24);
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
    // Each tone should have at least 4 and no more than 10
    for (const tone of ["boon", "mixed", "setback"] as const) {
      expect(counts[tone]).toBeGreaterThanOrEqual(4);
      expect(counts[tone]).toBeLessThanOrEqual(10);
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
