import { beforeEach, describe, expect, it } from "vitest";
import {
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
      motion: "full",
      keepAwake: false,
    });
  });

  it("recovers from malformed preferences", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      "{bad json",
    );

    expect(loadDevicePreferences()).toEqual(defaultDevicePreferences);
  });
});
