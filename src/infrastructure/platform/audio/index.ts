/**
 * Public audio surface for the app.
 *
 * The playback contract is unchanged: callers construct `AudioCues`, call
 * `play(cue)`, and adjust volume/mute. What is new is that a *pack* decides how
 * a cue is realised — synthesized on the spot, or played from a pre-rendered
 * one-shot — without any caller needing to know which.
 *
 * `engine.ts` provides physical primitives and a room; `cues.ts` designs each
 * synthesized sound as an object being struck, shaken or blown; `packs.ts`
 * enumerates the available realisations.
 */

import { AudioEngine, type EngineOptions } from "./engine";
import {
  barbarianAdvance,
  barbarianAttack,
  confirm,
  diceRoll,
  progress,
  seasonChange,
  worldEvent,
} from "./cues";
import {
  defaultSoundPackId,
  findSoundPack,
  soundPacks,
  type SampleAssetName,
  type SoundPackDefinition,
  type SoundPackId,
} from "../../../application/soundPacks";
import { SampleLibrary, type SampleLibraryOptions } from "./sampleLibrary";
import { selectSample } from "./sampleSelection";

export type {
  ProgressDisciplineSound,
  SeasonSound,
  SoundCue,
  SoundPlayOptions,
  WorldEventCategorySound,
  WorldEventToneSound,
} from "./cueTypes";

import type { SoundCue, SoundPlayOptions } from "./cueTypes";

export {
  defaultSoundPackId,
  findSoundPack,
  sampleAssetNames,
  soundPacks,
} from "../../../application/soundPacks";
export type {
  SampleAssetName,
  SoundPackDefinition,
  SoundPackId,
} from "../../../application/soundPacks";
export { SampleLibrary } from "./sampleLibrary";
export { selectSample } from "./sampleSelection";

/**
 * The assets worth fetching as soon as a sampled pack is chosen. Dice and
 * confirm fire within seconds of a game starting; everything else can wait
 * until it is first needed.
 */
const PRIMED_ASSETS: readonly SampleAssetName[] = [
  "dice-roll",
  "confirm",
  "progress-trade",
  "progress-science",
  "progress-politics",
];

/** Schedules a synthesized cue onto an engine. Shared by playback and renders. */
export function scheduleCue(
  engine: AudioEngine,
  cue: SoundCue,
  start: number,
): void {
  switch (cue.type) {
    case "dice-roll":
      diceRoll(engine, start);
      break;
    case "progress":
      progress(engine, start, cue.discipline);
      break;
    case "barbarian-advance":
      barbarianAdvance(engine, start, cue.spacesRemaining);
      break;
    case "barbarian-attack":
      barbarianAttack(engine, start, cue.outcome);
      break;
    case "world-event":
      worldEvent(
        engine,
        start,
        cue.eventId,
        cue.category,
        cue.tone,
        cue.impact,
      );
      break;
    case "season-change":
      seasonChange(engine, start, cue.season);
      break;
    case "confirm":
      confirm(engine, start);
      break;
  }
}

export interface AudioCuesOptions extends EngineOptions {
  pack?: SoundPackId;
  /** Injectable so tests can serve assets without a network. */
  sampleLibrary?: SampleLibraryOptions;
}

export class AudioCues {
  private engine: AudioEngine;
  private pack: SoundPackDefinition;
  private library: SampleLibrary | null = null;
  /**
   * One library per sampled pack, kept for the lifetime of the engine.
   *
   * A table comparing packs mid-game switches back and forth; rebuilding the
   * library each time would throw away every decoded buffer and re-download
   * the whole pack, and the first cue after each switch would fall back to the
   * synthesized voice. Keeping them means a switch back is instant.
   */
  private readonly libraries = new Map<SoundPackId, SampleLibrary>();
  private readonly options: AudioCuesOptions;

  constructor(options: AudioCuesOptions = {}) {
    this.options = options;
    this.engine = new AudioEngine(options);
    this.pack = findSoundPack(options.pack ?? defaultSoundPackId);
    this.library = this.createLibrary();
  }

  setVolume(value: number): void {
    this.engine.setVolume(value);
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  currentPack(): SoundPackId {
    return this.pack.id;
  }

  /**
   * Switching packs is cheap and non-destructive: the engine and its context
   * stay alive, so a change mid-game does not need another user gesture to
   * unlock audio, and already-decoded assets are kept rather than re-fetched.
   */
  setPack(id: SoundPackId): void {
    if (id === this.pack.id) {
      return;
    }
    this.pack = findSoundPack(id);
    this.library = this.createLibrary();
  }

  async unlock(): Promise<void> {
    await this.engine.unlock();
  }

  /**
   * Starts fetching the assets a sampled pack needs first. Safe to call at any
   * time, and a no-op for packs that do not use assets.
   */
  async prime(): Promise<void> {
    const library = this.library;
    if (!library) {
      return;
    }
    await this.engine.unlock();
    await library.prime(this.engine, PRIMED_ASSETS);
  }

  async play(cue: SoundCue, options: SoundPlayOptions = {}): Promise<void> {
    if (this.pack.kind === "none") {
      return;
    }

    await this.engine.unlock();
    const start = this.engine.now() + Math.max(0, options.delaySeconds ?? 0);
    const library = this.library;

    if (library) {
      const selection = selectSample(cue, this.engine.random);
      const buffer = library.get(selection.asset);
      if (buffer) {
        this.engine.sample({
          buffer,
          time: start,
          level: selection.level,
          rate: selection.rate,
          send: 0.16,
        });
        return;
      }

      // Not loaded yet: play the synthesized voice now so the table is never
      // left in silence, and fetch the asset for next time.
      scheduleCue(this.engine, cue, start);
      void library.load(this.engine, selection.asset);
      return;
    }

    scheduleCue(this.engine, cue, start);
  }

  close(): void {
    this.engine.close();
    // A closed context cannot be reused, so the next play starts a fresh one.
    // Decoded buffers belong to the old context, so the cache goes with it.
    this.engine = new AudioEngine(this.options);
    this.libraries.clear();
    this.library = this.createLibrary();
  }

  private createLibrary(): SampleLibrary | null {
    if (this.pack.kind !== "sampled") {
      return null;
    }
    const existing = this.libraries.get(this.pack.id);
    if (existing) {
      return existing;
    }
    const created = new SampleLibrary(this.pack, this.options.sampleLibrary);
    this.libraries.set(this.pack.id, created);
    return created;
  }
}

export { AudioEngine } from "./engine";
export type { EngineOptions } from "./engine";
export { soundPacks as availableSoundPacks };
