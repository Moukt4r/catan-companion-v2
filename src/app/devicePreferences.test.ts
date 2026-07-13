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

  it("recovers from malformed preferences", () => {
    window.localStorage.setItem(
      "catan-companion-device-preferences",
      "{bad json",
    );

    expect(loadDevicePreferences()).toEqual(defaultDevicePreferences);
  });
});
