import { z } from "zod";
import {
  defaultDevicePreferences,
  type DevicePreferences,
} from "../application/devicePreferences";

export {
  defaultDevicePreferences,
  type DevicePreferences,
} from "../application/devicePreferences";

const storageKey = "catan-companion-device-preferences";

export const devicePreferencesSchema: z.ZodType<DevicePreferences> = z.object({
  theme: z.enum(["system", "light", "dark", "high-contrast"]).default("system"),
  soundEnabled: z.boolean().default(false),
  soundVolume: z.number().min(0).max(1).default(0.55),
  motion: z.enum(["system", "full", "reduced"]).default("system"),
  keepAwake: z.boolean().default(false),
});

export function loadDevicePreferences(): DevicePreferences {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      return defaultDevicePreferences;
    }
    return devicePreferencesSchema.parse(JSON.parse(stored) as unknown);
  } catch {
    return defaultDevicePreferences;
  }
}

export function saveDevicePreferences(preferences: DevicePreferences): void {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(devicePreferencesSchema.parse(preferences)),
  );
}

export function applyDevicePreferences(preferences: DevicePreferences): void {
  const root = window.document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const reduced = prefersReducedMotion(preferences);

  const theme =
    preferences.theme === "system"
      ? prefersDark
        ? "dark"
        : "light"
      : preferences.theme;

  root.dataset.theme = theme;
  root.dataset.motion = reduced ? "reduced" : "full";
}

/**
 * Whether the table has asked for reduced motion, honouring the OS setting
 * when the preference is left on "system".
 */
export function prefersReducedMotion(preferences: DevicePreferences): boolean {
  if (preferences.motion === "system") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return preferences.motion === "reduced";
}
