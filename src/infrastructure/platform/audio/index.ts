/**
 * Public audio surface for the app. The API is deliberately unchanged from the
 * original oscillator-based implementation: callers still construct
 * `AudioCues`, call `play(cue)`, and adjust volume/mute.
 *
 * What changed is underneath. `engine.ts` provides physical primitives and a
 * room; `cues.ts` designs each sound as an object being struck, shaken or
 * blown rather than as a chord.
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
  type ProgressDisciplineSound,
  type SeasonSound,
  type WorldEventCategorySound,
  type WorldEventToneSound,
} from "./cues";

export type {
  ProgressDisciplineSound,
  SeasonSound,
  WorldEventCategorySound,
  WorldEventToneSound,
};

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

/** Schedules a cue onto an engine. Shared by live playback and offline renders. */
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

export class AudioCues {
  private engine: AudioEngine;
  private readonly options: EngineOptions;

  constructor(options: EngineOptions = {}) {
    this.options = options;
    this.engine = new AudioEngine(options);
  }

  setVolume(value: number): void {
    this.engine.setVolume(value);
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  async unlock(): Promise<void> {
    await this.engine.unlock();
  }

  async play(cue: SoundCue, options: SoundPlayOptions = {}): Promise<void> {
    await this.engine.unlock();
    const start = this.engine.now() + Math.max(0, options.delaySeconds ?? 0);
    scheduleCue(this.engine, cue, start);
  }

  close(): void {
    this.engine.close();
    // A closed context cannot be reused, so the next play starts a fresh one.
    this.engine = new AudioEngine(this.options);
  }
}

export { AudioEngine } from "./engine";
export type { EngineOptions } from "./engine";
