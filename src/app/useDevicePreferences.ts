import { useCallback, useEffect, useState } from "react";
import {
  applyDevicePreferences,
  loadDevicePreferences,
  saveDevicePreferences,
  type DevicePreferences,
} from "./devicePreferences";

export function useDevicePreferences() {
  const [preferences, setPreferencesState] = useState<DevicePreferences>(
    loadDevicePreferences,
  );

  useEffect(() => {
    applyDevicePreferences(preferences);
    saveDevicePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const colorQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      applyDevicePreferences(preferences);
    };

    colorQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    return () => {
      colorQuery.removeEventListener("change", update);
      motionQuery.removeEventListener("change", update);
    };
  }, [preferences]);

  const updatePreferences = useCallback((patch: Partial<DevicePreferences>) => {
    setPreferencesState((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

  return {
    preferences,
    updatePreferences,
  };
}
