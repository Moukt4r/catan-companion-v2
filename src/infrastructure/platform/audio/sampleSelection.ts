/**
 * Maps a cue to the pack asset that represents it.
 *
 * The cue vocabulary is richer than the asset list on purpose: a barbarian
 * advance carries an exact distance, and a world event carries an impact
 * weight. A sampled pack cannot hold a separate recording for every
 * combination, so this is where the continuous parameters collapse onto the
 * discrete set of clips, and where the leftover expression is turned into
 * playback-rate and level variation instead.
 */

import type {
  SoundCue,
  WorldEventCategorySound,
  WorldEventToneSound,
} from "./cueTypes";
import type { SampleAssetName } from "../../../application/soundPacks";

export interface SampleSelection {
  asset: SampleAssetName;
  /**
   * Playback rate. Kept close to 1 so the material stays recognisable; it
   * carries urgency and keeps repeated cues from sounding cloned.
   */
  rate: number;
  /** Relative level, before the master volume applies. */
  level: number;
}

/** Rate jitter in cents. Small enough to be felt rather than heard. */
const JITTER_CENTS = 18;

export function selectSample(
  cue: SoundCue,
  random: () => number,
): SampleSelection {
  const jitter = Math.pow(2, ((random() * 2 - 1) * JITTER_CENTS) / 1_200);

  switch (cue.type) {
    case "dice-roll":
      return { asset: "dice-roll", rate: jitter, level: 0.9 };

    case "progress":
      return {
        asset:
          cue.discipline === "trade"
            ? "progress-trade"
            : cue.discipline === "science"
              ? "progress-science"
              : "progress-politics",
        rate: jitter,
        level: 0.85,
      };

    case "barbarian-advance": {
      // Closer means faster and louder. Two clips cover the range; the rate
      // carries the rest of the approach.
      const urgency = Math.min(1, Math.max(0, (7 - cue.spacesRemaining) / 6));
      return {
        asset:
          urgency >= 0.5 ? "barbarian-advance-near" : "barbarian-advance-far",
        rate: jitter * (0.97 + urgency * 0.08),
        level: 0.72 + urgency * 0.18,
      };
    }

    case "barbarian-attack":
      return {
        asset:
          cue.outcome === "defenders-win"
            ? "barbarian-attack-defended"
            : cue.outcome === "barbarians-win"
              ? "barbarian-attack-pillaged"
              : "barbarian-attack-board",
        rate: jitter,
        level: 0.95,
      };

    case "world-event":
      // Impact becomes level, so a minor event does not land like a disaster.
      return {
        asset: worldEventAsset(cue.category, cue.tone),
        rate: jitter,
        level: 0.6 + cue.impact * 0.12,
      };

    case "season-change":
      return {
        asset:
          cue.season === "spring"
            ? "season-spring"
            : cue.season === "summer"
              ? "season-summer"
              : cue.season === "autumn"
                ? "season-autumn"
                : "season-winter",
        rate: jitter,
        level: 0.8,
      };

    case "confirm":
      return { asset: "confirm", rate: jitter, level: 0.7 };
  }
}

/**
 * Five categories and three tones would be fifteen clips. Only the pairs that
 * actually read differently are recorded; the rest borrow the nearest one that
 * carries the same emotional direction.
 */
function worldEventAsset(
  category: WorldEventCategorySound,
  tone: WorldEventToneSound,
): SampleAssetName {
  switch (category) {
    case "economy":
      return tone === "setback"
        ? "event-military-setback"
        : "event-economy-boon";
    case "diplomacy":
      return tone === "setback"
        ? "event-military-setback"
        : "event-diplomacy-boon";
    case "military":
      return tone === "boon" ? "event-economy-boon" : "event-military-setback";
    case "nature":
      return tone === "boon" ? "event-diplomacy-boon" : "event-nature-setback";
    case "society":
      return tone === "setback"
        ? "event-military-setback"
        : "event-society-mixed";
  }
}
