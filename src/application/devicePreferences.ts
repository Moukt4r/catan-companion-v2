import type { SoundPackId } from "./soundPacks";

export interface DevicePreferences {
  theme: "system" | "light" | "dark" | "high-contrast";
  soundEnabled: boolean;
  soundVolume: number;
  soundPack: SoundPackId;
  motion: "system" | "full" | "reduced";
  keepAwake: boolean;
}

export const defaultDevicePreferences: DevicePreferences = {
  theme: "system",
  soundEnabled: false,
  soundVolume: 0.55,
  soundPack: "workshop",
  motion: "system",
  keepAwake: false,
};
