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
      outcome: "defenders-win" | "barbarians-win";
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

const SILENCE = 0.0001;
const DEFAULT_VOLUME = 0.55;

type AudioContextConstructor = new () => AudioContext;
type AudioGlobal = typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export class AudioCues {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private volume = DEFAULT_VOLUME;
  private muted = false;

  setVolume(value: number): void {
    this.volume = clampVolume(value);
    this.applyOutputLevel();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyOutputLevel();
  }

  async unlock(): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  async play(cue: SoundCue, options: SoundPlayOptions = {}): Promise<void> {
    await this.unlock();
    const context = this.getContext();
    const start = context.currentTime + Math.max(0, options.delaySeconds ?? 0);

    switch (cue.type) {
      case "dice-roll":
        this.scheduleDiceRoll(start);
        break;
      case "progress":
        this.scheduleProgress(start, cue.discipline);
        break;
      case "barbarian-advance":
        this.scheduleBarbarianAdvance(start, cue.spacesRemaining);
        break;
      case "barbarian-attack":
        this.scheduleBarbarianAttack(start, cue.outcome);
        break;
      case "world-event":
        this.scheduleWorldEvent(
          start,
          cue.eventId,
          cue.category,
          cue.tone,
          cue.impact,
        );
        break;
      case "season-change":
        this.scheduleSeasonChange(start, cue.season);
        break;
      case "confirm":
        this.scheduleConfirm(start);
        break;
    }
  }

  close(): void {
    if (this.context) {
      void this.context.close();
      this.context = null;
      this.output = null;
    }
  }

  private getContext(): AudioContext {
    if (this.context) return this.context;

    const audioGlobal = globalThis as AudioGlobal;
    const Context = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    if (!Context) {
      throw new Error("Web Audio is not supported by this browser.");
    }

    this.context = new Context();
    this.output = this.context.createGain();
    this.output.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      this.context.currentTime,
    );
    this.output.connect(this.context.destination);
    return this.context;
  }

  private applyOutputLevel(): void {
    if (!this.context || !this.output) return;
    this.output.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      this.context.currentTime,
    );
  }

  private scheduleDiceRoll(start: number): void {
    const offsets = [0, 0.045, 0.095, 0.15, 0.215, 0.29, 0.38, 0.49];
    offsets.forEach((offset, index) => {
      this.noise(
        start + offset,
        0.045 + index * 0.002,
        0.11 - index * 0.006,
        "bandpass",
        360 + ((index * 173) % 520),
      );
      this.tone(
        92 + ((index * 29) % 75),
        start + offset,
        0.04,
        0.045,
        "triangle",
      );
    });
    this.tone(76, start + 0.51, 0.13, 0.08, "sine", 58);
  }

  private scheduleProgress(
    start: number,
    discipline: ProgressDisciplineSound,
  ): void {
    const palette: Record<
      ProgressDisciplineSound,
      { frequencies: number[]; type: OscillatorType; gain: number }
    > = {
      science: {
        frequencies: [659, 880, 1047],
        type: "sine",
        gain: 0.075,
      },
      trade: {
        frequencies: [1047, 1568, 2093],
        type: "triangle",
        gain: 0.055,
      },
      politics: {
        frequencies: [262, 330, 392],
        type: "sawtooth",
        gain: 0.045,
      },
    };
    const selected = palette[discipline];
    selected.frequencies.forEach((frequency, index) => {
      this.tone(
        frequency,
        start + index * 0.085,
        discipline === "trade" ? 0.16 : 0.2,
        selected.gain,
        selected.type,
      );
    });
    if (discipline === "trade") {
      this.tone(2637, start + 0.055, 0.11, 0.035, "sine");
    }
  }

  private scheduleBarbarianAdvance(
    start: number,
    spacesRemaining: number,
  ): void {
    const urgency = spacesRemaining <= 2 ? 1 : 0;
    this.drum(start, 0.13, 0.13, 72);
    this.tone(96, start, 0.34, 0.055, "sawtooth", 72);
    if (urgency) {
      this.drum(start + 0.22, 0.12, 0.11, 66);
      this.tone(147, start + 0.18, 0.32, 0.045, "square", 110);
    }
  }

  private scheduleBarbarianAttack(
    start: number,
    outcome: "defenders-win" | "barbarians-win",
  ): void {
    [0, 0.16, 0.31].forEach((offset, index) => {
      this.drum(start + offset, 0.13 + index * 0.025, 0.14, 62 - index * 3);
    });
    this.noise(start + 0.43, 0.42, 0.15, "lowpass", 850);
    this.tone(110, start + 0.05, 0.52, 0.065, "sawtooth", 82);

    const frequencies =
      outcome === "defenders-win" ? [196, 247, 294] : [196, 175, 147];
    frequencies.forEach((frequency, index) => {
      this.tone(
        frequency,
        start + 0.47 + index * 0.1,
        0.3,
        0.055,
        outcome === "defenders-win" ? "triangle" : "square",
      );
    });
  }

  private scheduleWorldEvent(
    start: number,
    eventId: string,
    category: WorldEventCategorySound,
    tone: WorldEventToneSound,
    impact: 1 | 2 | 3,
  ): void {
    const categoryBase: Record<WorldEventCategorySound, number> = {
      economy: 523,
      military: 196,
      diplomacy: 587,
      nature: 220,
      society: 392,
    };
    const toneRatios: Record<WorldEventToneSound, [number, number]> = {
      boon: [1, 1.25],
      mixed: [1, Math.SQRT2],
      setback: [1, 0.89],
    };
    const base = categoryBase[category];
    const [firstRatio, secondRatio] = toneRatios[tone];
    const waveform: OscillatorType =
      category === "military"
        ? "triangle"
        : category === "economy"
          ? "sine"
          : category === "nature"
            ? "sawtooth"
            : "sine";
    const gain = 0.045 + impact * 0.012;

    this.tone(base * firstRatio, start, 0.34, gain, waveform);
    this.tone(base * secondRatio, start + 0.12, 0.38, gain, waveform);
    if (impact >= 2) {
      this.tone(base * 0.5, start + 0.04, 0.48, gain * 0.7, "sine");
    }
    if (impact === 3) {
      this.tone(base * 1.5, start + 0.2, 0.4, gain * 0.65, "triangle");
    }

    // Every built-in event gets a stable identity note in addition to its
    // category/tone/impact grammar, without shipping separate audio assets.
    this.tone(
      this.eventIdentityFrequency(eventId),
      start + 0.29,
      0.18,
      0.026 + impact * 0.004,
      "sine",
    );

    switch (category) {
      case "economy":
        this.tone(1760, start + 0.04, 0.12, 0.038, "triangle");
        this.tone(2349, start + 0.12, 0.11, 0.028, "sine");
        break;
      case "military":
        this.drum(start, 0.11, 0.1 + impact * 0.012, 64);
        if (impact === 3) this.drum(start + 0.2, 0.13, 0.12, 58);
        break;
      case "diplomacy":
        this.tone(1175, start + 0.06, 0.34, 0.035, "sine");
        break;
      case "nature":
        this.noise(start, 0.48, 0.06 + impact * 0.01, "bandpass", 680);
        break;
      case "society":
        this.tone(base * 1.5, start + 0.07, 0.38, 0.04, "sine");
        break;
    }
  }

  private eventIdentityFrequency(eventId: string): number {
    let hash = 2_166_136_261;
    for (let index = 0; index < eventId.length; index += 1) {
      hash ^= eventId.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619) >>> 0;
    }
    return 720 + (hash % 1_200);
  }

  private scheduleSeasonChange(start: number, season: SeasonSound): void {
    const palettes: Record<SeasonSound, number[]> = {
      spring: [880, 1175, 1319, 1760],
      summer: [523, 659, 784, 1047],
      autumn: [392, 494, 587, 784],
      winter: [1175, 1568, 1760, 2349],
    };
    const waveform: OscillatorType = season === "autumn" ? "triangle" : "sine";
    palettes[season].forEach((frequency, index) => {
      this.tone(
        frequency,
        start + index * 0.07,
        0.42 - index * 0.025,
        0.045 - index * 0.004,
        waveform,
      );
    });
    if (season === "winter") {
      this.noise(start, 0.48, 0.035, "highpass", 1800);
    }
  }

  private scheduleConfirm(start: number): void {
    this.tone(440, start, 0.13, 0.045, "sine");
    this.tone(659, start + 0.08, 0.16, 0.055, "sine");
  }

  private drum(
    start: number,
    duration: number,
    gain: number,
    frequency: number,
  ): void {
    this.tone(frequency, start, duration, gain, "sine", frequency * 0.55);
    this.noise(start, duration * 0.72, gain * 0.52, "lowpass", 520);
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    peakGain: number,
    type: OscillatorType,
    endFrequency = frequency,
  ): void {
    const context = this.getContext();
    const output = this.output;
    if (!output) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const end = start + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      end,
    );
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(SILENCE, peakGain),
      start + Math.min(0.018, duration * 0.2),
    );
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }

  private noise(
    start: number,
    duration: number,
    peakGain: number,
    filterType: BiquadFilterType,
    frequency: number,
  ): void {
    const context = this.getContext();
    const output = this.output;
    if (!output) return;

    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const end = start + duration;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(SILENCE, peakGain),
      start + Math.min(0.012, duration * 0.18),
    );
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.start(start);
    source.stop(end + 0.01);
  }
}
