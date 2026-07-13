import { z } from "zod";

const storageKey = "catan-companion-device-preferences";

export const devicePreferencesSchema = z.object({
  theme: z.enum(["system", "light", "dark", "high-contrast"]).default("system"),
  soundEnabled: z.boolean().default(false),
  motion: z.enum(["system", "full", "reduced"]).default("system"),
  keepAwake: z.boolean().default(false),
});

export type DevicePreferences = z.infer<typeof devicePreferencesSchema>;

export const defaultDevicePreferences: DevicePreferences =
  devicePreferencesSchema.parse({});

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
  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const theme =
    preferences.theme === "system"
      ? prefersDark
        ? "dark"
        : "light"
      : preferences.theme;
  const reduced =
    preferences.motion === "system"
      ? prefersReduced
      : preferences.motion === "reduced";

  root.dataset.theme = theme;
  root.dataset.motion = reduced ? "reduced" : "full";
}
