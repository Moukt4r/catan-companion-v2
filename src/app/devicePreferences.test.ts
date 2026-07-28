import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDevicePreferences,
  defaultDevicePreferences,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./devicePreferences";

describe("device preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses safe defaults when no preferences are stored", () => {
    expect(loadDevicePreferences()).toEqual(defaultDevicePreferences);
  });

  it("round trips validated preferences", () => {
    const preferences = {
      ...defaultDevicePreferences,
      keepAwake: true,
      theme: "dark" as const,
    };

    saveDevicePreferences(preferences);

    expect(loadDevicePreferences()).toEqual(preferences);
  });

  it("migrates older preferences with a safe default volume", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      JSON.stringify({
        theme: "dark",
        soundEnabled: true,
        motion: "full",
        keepAwake: false,
      }),
    );

    expect(loadDevicePreferences()).toEqual({
      theme: "dark",
      soundEnabled: true,
      soundVolume: 0.55,
      soundPack: "workshop",
      diceRollMs: 650,
      motion: "full",
      keepAwake: false,
    });
  });

  it("falls back to the default roll length when a stored value is unknown", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      JSON.stringify({
        ...defaultDevicePreferences,
        diceRollMs: 99_999,
      }),
    );

    expect(loadDevicePreferences().diceRollMs).toBe(650);
  });

  it("round trips a chosen roll length", () => {
    saveDevicePreferences({ ...defaultDevicePreferences, diceRollMs: 1800 });

    expect(loadDevicePreferences().diceRollMs).toBe(1800);
  });

  it("falls back to the synthesized pack when a stored pack is unknown", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      JSON.stringify({
        theme: "dark",
        soundEnabled: true,
        soundVolume: 0.4,
        soundPack: "a-pack-from-a-future-version",
        motion: "full",
        keepAwake: false,
      }),
    );

    expect(loadDevicePreferences().soundPack).toBe("workshop");
  });

  it("round trips a selected sound pack", () => {
    saveDevicePreferences({
      ...defaultDevicePreferences,
      soundEnabled: true,
      soundPack: "hearth",
    });

    expect(loadDevicePreferences().soundPack).toBe("hearth");
  });

  it("recovers from malformed preferences", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      "{bad json",
    );

    expect(loadDevicePreferences()).toEqual(defaultDevicePreferences);
  });
});

describe("roll pacing is applied to the document", () => {
  beforeEach(() => {
    // jsdom has no media-query engine; the theme/motion branches only need a
    // deterministic answer for these assertions.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it("publishes the chosen duration so the CSS animations follow it", () => {
    applyDevicePreferences({ ...defaultDevicePreferences, diceRollMs: 1800 });

    const style = window.document.documentElement.style;
    expect(style.getPropertyValue("--dice-roll-duration")).toBe("1800ms");
    // The cube travels further than the flat face pops, so it gets more time.
    expect(style.getPropertyValue("--dice-tumble-duration")).toBe("3186ms");
  });

  it("shortens both durations together when a quick roll is chosen", () => {
    applyDevicePreferences({ ...defaultDevicePreferences, diceRollMs: 350 });

    const style = window.document.documentElement.style;
    expect(style.getPropertyValue("--dice-roll-duration")).toBe("350ms");
    expect(style.getPropertyValue("--dice-tumble-duration")).toBe("620ms");
  });
});
