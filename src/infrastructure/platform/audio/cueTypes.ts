/**
 * The cue vocabulary.
 *
 * This lives apart from `index.ts` so packs, the sample library and the
 * selection table can all depend on the vocabulary without depending on the
 * playback facade that owns them.
 */

export type ProgressDisciplineSound = "politics" | "science" | "trade";
export type WorldEventCategorySound =
  "diplomacy" | "economy" | "military" | "nature" | "society";
export type WorldEventToneSound = "boon" | "mixed" | "setback";
export type SeasonSound = "spring" | "summer" | "autumn" | "winter";

export type SoundCue =
  | { type: "dice-roll" }
  | { type: "progress"; discipline: ProgressDisciplineSound }
  | { type: "barbarian-advance"; spacesRemaining: number }
  | {
      type: "barbarian-attack";
      outcome: "defenders-win" | "barbarians-win" | "board-authoritative";
    }
  | {
      type: "world-event";
      eventId: string;
      category: WorldEventCategorySound;
      tone: WorldEventToneSound;
      impact: 1 | 2 | 3;
    }
  | { type: "season-change"; season: SeasonSound }
  | { type: "confirm" };

export interface SoundPlayOptions {
  delaySeconds?: number;
}
