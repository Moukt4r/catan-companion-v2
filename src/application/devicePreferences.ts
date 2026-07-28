import type { SoundPackId } from "./soundPacks";

/**
 * How long the dice tumble before the result is announced, in milliseconds.
 *
 * The roll animation never decides the outcome — the deck has already drawn it
 * — so this is purely a pacing choice. Tables that play fast want it short;
 * tables that enjoy the suspense want it long.
 */
export const diceRollDurations = [350, 650, 1100, 1800] as const;
export type DiceRollDuration = (typeof diceRollDurations)[number];

export const defaultDiceRollMs: DiceRollDuration = 650;

export interface DevicePreferences {
  theme: "system" | "light" | "dark" | "high-contrast";
  soundEnabled: boolean;
  soundVolume: number;
  soundPack: SoundPackId;
  motion: "system" | "full" | "reduced";
  diceRollMs: DiceRollDuration;
  keepAwake: boolean;
}

export const defaultDevicePreferences: DevicePreferences = {
  theme: "system",
  soundEnabled: false,
  soundVolume: 0.55,
  soundPack: "workshop",
  motion: "system",
  diceRollMs: defaultDiceRollMs,
  keepAwake: false,
};
