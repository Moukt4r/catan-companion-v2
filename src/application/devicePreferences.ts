export interface DevicePreferences {
  theme: "system" | "light" | "dark" | "high-contrast";
  soundEnabled: boolean;
  soundVolume: number;
  motion: "system" | "full" | "reduced";
  keepAwake: boolean;
}

export const defaultDevicePreferences: DevicePreferences = {
  theme: "system",
  soundEnabled: false,
  soundVolume: 0.55,
  motion: "system",
  keepAwake: false,
};
