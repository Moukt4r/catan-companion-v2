export interface DevicePreferences {
  theme: "system" | "light" | "dark" | "high-contrast";
  soundEnabled: boolean;
  motion: "system" | "full" | "reduced";
  keepAwake: boolean;
}

export const defaultDevicePreferences: DevicePreferences = {
  theme: "system",
  soundEnabled: false,
  motion: "system",
  keepAwake: false,
};
