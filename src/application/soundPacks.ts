/**
 * Sound pack definitions.
 *
 * A pack decides *how* a cue is produced, not *which* cues exist. The cue
 * vocabulary in `index.ts` is the contract; a pack is one realisation of it.
 *
 * Two kinds exist today:
 *
 * - `synth` — the procedural engine. Every playback is freshly synthesized, so
 *   no two dice rolls are identical, and it costs nothing to download.
 * - `sampled` — one-shots rendered ahead of time, decoded on demand and played
 *   through the same master chain. Richer material, but a fixed recording.
 *
 * Sampled packs deliberately keep a synth fallback per cue: if an asset fails
 * to load, or the browser cannot decode it, the table still gets a sound
 * rather than silence.
 */

export type SoundPackId = "workshop" | "hearth" | "silent";

export interface SoundPackDefinition {
  id: SoundPackId;
  /** Shown in the setup wizard and settings dialog. */
  label: string;
  /** One sentence, plain language, no audio jargon. */
  description: string;
  kind: "synth" | "sampled" | "none";
  /**
   * Directory under the app base holding `<asset>.opus` files. Sampled packs
   * only.
   */
  assetDirectory?: string;
}

export const soundPacks: readonly SoundPackDefinition[] = [
  {
    id: "workshop",
    label: "Workshop",
    description:
      "Synthesized on the spot. Every roll sounds slightly different and nothing is downloaded.",
    kind: "synth",
  },
  {
    id: "hearth",
    label: "Hearth",
    description:
      "Recorded-style one-shots with more body and grain. Downloads a small set of clips the first time it is used.",
    kind: "sampled",
    assetDirectory: "sfx/hearth",
  },
  {
    id: "silent",
    label: "Silent",
    description: "No sound at all, while keeping every on-screen cue.",
    kind: "none",
  },
];

export const defaultSoundPackId: SoundPackId = "workshop";

const packsById = new Map<SoundPackId, SoundPackDefinition>(
  soundPacks.map((pack) => [pack.id, pack]),
);

export function findSoundPack(id: SoundPackId): SoundPackDefinition {
  const pack = packsById.get(id);
  if (!pack) {
    throw new Error(`Unknown sound pack: ${id}`);
  }
  return pack;
}

/**
 * The asset names a sampled pack must provide. These are the leaves of the cue
 * vocabulary: a cue plus the parameters that change which recording is right.
 */
export const sampleAssetNames = [
  "dice-roll",
  "progress-trade",
  "progress-science",
  "progress-politics",
  "barbarian-advance-far",
  "barbarian-advance-near",
  "barbarian-attack-board",
  "barbarian-attack-defended",
  "barbarian-attack-pillaged",
  "event-economy-boon",
  "event-diplomacy-boon",
  "event-military-setback",
  "event-nature-setback",
  "event-society-mixed",
  "season-spring",
  "season-summer",
  "season-autumn",
  "season-winter",
  "confirm",
] as const;

export type SampleAssetName = (typeof sampleAssetNames)[number];
