/**
 * Low-level audio engine: context handling, the master bus, a synthesized
 * reverb, and the physical primitives every cue is built from.
 *
 * Nothing here knows about Catan. It knows about wood, metal, skin, air and
 * rooms. The cue designs in `cues.ts` combine these into game sounds.
 */

export interface EngineOptions {
  /** Injectable for offline rendering and tests. */
  createContext?: () => BaseAudioContext;
  /** Injectable so renders and tests are reproducible. */
  random?: () => number;
}

type AudioContextConstructor = new () => AudioContext;
type AudioGlobal = typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor;
};

/** Materials differ mainly in where their resonance sits and how fast it dies. */
export interface ImpactOptions {
  time: number;
  level: number;
  /** Resonant body frequency in Hz. Wood ~1.6k, bone ~3k, table ~120. */
  body: number;
  /** How long the body rings, in seconds. */
  decay: number;
  /** Brightness of the initial contact click, in Hz. */
  click?: number;
  /** Low thump under the contact, in Hz. 0 disables it. */
  thump?: number;
  pan?: number;
  send?: number;
  /** Resonance of the body filter. Higher is more metallic/hollow. */
  q?: number;
}

export interface ToneOptions {
  time: number;
  level: number;
  frequency: number;
  /** Glide target. Defaults to no glide. */
  endFrequency?: number;
  duration: number;
  attack?: number;
  type?: OscillatorType;
  pan?: number;
  send?: number;
  /** Fraction of duration spent gliding. */
  glide?: number;
}

export interface NoiseOptions {
  time: number;
  level: number;
  duration: number;
  filter?: BiquadFilterType;
  frequency: number;
  endFrequency?: number;
  q?: number;
  attack?: number;
  pan?: number;
  send?: number;
}

/**
 * A recorded (or offline-rendered) one-shot played through the same master
 * chain as the synthesized voices, so volume, mute and the limiter apply
 * identically no matter which pack is selected.
 */
export interface SampleOptions {
  buffer: AudioBuffer;
  time: number;
  level: number;
  /** Playback rate. Small deviations keep repeated hits from sounding cloned. */
  rate?: number;
  pan?: number;
  send?: number;
}

export interface PartialsOptions {
  time: number;
  level: number;
  /** Fundamental in Hz. */
  frequency: number;
  /** Inharmonic multipliers. Metal and glass are not harmonic. */
  ratios: readonly number[];
  decay: number;
  pan?: number;
  send?: number;
  type?: OscillatorType;
  /** Cents of random detune per partial, for a less synthetic stack. */
  spread?: number;
}

const MIN_GAIN = 0.000_01;

export class AudioEngine {
  private context: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.55;
  private muted = false;
  private readonly createContext: () => BaseAudioContext;
  readonly random: () => number;

  constructor(options: EngineOptions = {}) {
    this.random = options.random ?? Math.random;
    this.createContext =
      options.createContext ??
      (() => {
        const audioGlobal = globalThis as AudioGlobal;
        const Constructor =
          audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
        if (!Constructor) {
          throw new Error("Web Audio is not supported by this browser.");
        }
        return new Constructor();
      });
  }

  setVolume(value: number): void {
    this.volume = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 0.55;
    this.applyLevel();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevel();
  }

  async unlock(): Promise<void> {
    const context = this.ensure();
    // Offline contexts have no resume and never need unlocking.
    if ("resume" in context && context.state === "suspended") {
      await (context as AudioContext).resume();
    }
  }

  close(): void {
    const context = this.context;
    if (context && "close" in context) {
      void (context as AudioContext).close();
    }
    this.context = null;
    this.master = null;
    this.dry = null;
    this.wet = null;
    this.noiseBuffer = null;
  }

  now(): number {
    return this.ensure().currentTime;
  }

  /** The context sample rate, needed when decoding pack assets. */
  sampleRate(): number {
    return this.ensure().sampleRate;
  }

  /**
   * Decodes an encoded asset with the live context so the browser resamples it
   * to the hardware rate for us.
   */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const context = this.ensure();
    return await context.decodeAudioData(data);
  }

  /** Uniform random in a range, from the injected source. */
  range(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * The master chain is dry + a reverb send into a limiter. The limiter is
   * what lets several loud layers stack without the output crackling.
   */
  private ensure(): BaseAudioContext {
    if (this.context) return this.context;

    const context = this.createContext();
    this.context = context;

    const master = context.createGain();
    master.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      context.currentTime,
    );

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-8, context.currentTime);
    limiter.knee.setValueAtTime(6, context.currentTime);
    limiter.ratio.setValueAtTime(12, context.currentTime);
    limiter.attack.setValueAtTime(0.003, context.currentTime);
    limiter.release.setValueAtTime(0.18, context.currentTime);

    const dry = context.createGain();
    dry.gain.setValueAtTime(1, context.currentTime);

    const wet = context.createGain();
    wet.gain.setValueAtTime(1, context.currentTime);

    const reverb = context.createConvolver();
    reverb.buffer = this.buildImpulseResponse(context);

    dry.connect(limiter);
    wet.connect(reverb);
    reverb.connect(limiter);
    limiter.connect(master);
    master.connect(context.destination);

    this.master = master;
    this.dry = dry;
    this.wet = wet;
    return context;
  }

  private applyLevel(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    master.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      context.currentTime,
    );
  }

  /**
   * A small wooden room. Early reflections first, then a smoothed noise tail
   * that decays exponentially. Smoothing keeps the tail from hissing.
   */
  private buildImpulseResponse(context: BaseAudioContext): AudioBuffer {
    const seconds = 1.1;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const reflections = [0.011, 0.019, 0.027, 0.041, 0.058, 0.073];

    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let index = 0; index < length; index += 1) {
        const progress = index / length;
        const decay = Math.exp(-4.2 * progress) * (1 - progress);
        const white = this.random() * 2 - 1;
        // One-pole smoothing rolls off the top so the tail sounds like a room
        // rather than white noise.
        previous = previous * 0.62 + white * 0.38;
        data[index] = previous * decay * 0.55;
      }
      reflections.forEach((offset, order) => {
        const position = Math.floor(
          (offset + (channel === 1 ? 0.004 : 0)) * context.sampleRate,
        );
        const existing = data[position];
        if (position < length && existing !== undefined) {
          data[position] =
            existing + (0.44 - order * 0.06) * (channel ? -1 : 1);
        }
      });
    }
    return buffer;
  }

  /** One shared noise buffer, read from random offsets. Cheap and varied. */
  private getNoise(context: BaseAudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.max(1, Math.floor(context.sampleRate * 2));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = this.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private route(node: AudioNode, pan: number, send: number): void {
    const context = this.ensure();
    const dry = this.dry;
    const wet = this.wet;
    if (!dry || !wet) return;

    let tail: AudioNode = node;
    if (pan !== 0 && "createStereoPanner" in context) {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(
        Math.min(1, Math.max(-1, pan)),
        context.currentTime,
      );
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(dry);
    if (send > 0) {
      const sendGain = context.createGain();
      sendGain.gain.setValueAtTime(send, context.currentTime);
      tail.connect(sendGain);
      sendGain.connect(wet);
    }
  }

  /**
   * Percussive envelope: near-instant attack, then exponential damping the way
   * a struck object actually loses energy.
   */
  private strike(
    gain: AudioParam,
    time: number,
    level: number,
    decay: number,
    attack: number,
  ): void {
    const peak = Math.max(MIN_GAIN, level);
    gain.setValueAtTime(0, time);
    gain.linearRampToValueAtTime(peak, time + attack);
    gain.setTargetAtTime(0, time + attack, Math.max(0.004, decay / 3.2));
    gain.linearRampToValueAtTime(0, time + attack + decay);
  }

  tone(options: ToneOptions): void {
    const context = this.ensure();
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const attack = options.attack ?? 0.004;
    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(options.frequency, options.time);
    if (options.endFrequency && options.endFrequency !== options.frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.endFrequency),
        options.time + options.duration * (options.glide ?? 1),
      );
    }
    this.strike(
      envelope.gain,
      options.time,
      options.level,
      options.duration,
      attack,
    );
    oscillator.connect(envelope);
    this.route(envelope, options.pan ?? 0, options.send ?? 0);
    oscillator.start(options.time);
    oscillator.stop(options.time + options.duration + attack + 0.02);
  }

  noise(options: NoiseOptions): void {
    const context = this.ensure();
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const attack = options.attack ?? 0.002;

    source.buffer = this.getNoise(context);
    source.loop = true;
    filter.type = options.filter ?? "bandpass";
    filter.frequency.setValueAtTime(options.frequency, options.time);
    if (options.endFrequency && options.endFrequency !== options.frequency) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.endFrequency),
        options.time + options.duration,
      );
    }
    filter.Q.setValueAtTime(options.q ?? 1, options.time);
    this.strike(
      envelope.gain,
      options.time,
      options.level,
      options.duration,
      attack,
    );

    source.connect(filter);
    filter.connect(envelope);
    this.route(envelope, options.pan ?? 0, options.send ?? 0);
    // Reading from a random offset keeps repeated hits from sounding cloned.
    source.start(options.time, this.range(0, 1.4));
    source.stop(options.time + options.duration + attack + 0.02);
  }

  /** Contact click, resonant body, optional low thump. The shape of a hit. */
  impact(options: ImpactOptions): void {
    const pan = options.pan ?? 0;
    const send = options.send ?? 0.12;

    if (options.click) {
      this.noise({
        time: options.time,
        level: options.level * 0.75,
        duration: 0.006,
        filter: "highpass",
        frequency: options.click,
        attack: 0.0005,
        pan,
        send: send * 0.5,
      });
    }
    this.noise({
      time: options.time,
      level: options.level,
      duration: options.decay,
      filter: "bandpass",
      frequency: options.body,
      endFrequency: options.body * 0.72,
      q: options.q ?? 4.5,
      attack: 0.001,
      pan,
      send,
    });
    if (options.thump) {
      this.tone({
        time: options.time,
        level: options.level * 0.85,
        frequency: options.thump,
        endFrequency: options.thump * 0.55,
        duration: Math.max(0.05, options.decay * 1.6),
        attack: 0.001,
        glide: 0.5,
        pan,
        send: send * 0.6,
      });
    }
  }

  /**
   * Plays a decoded one-shot. The envelope is a plain gain because the asset
   * already carries its own attack and decay; all we add is level, a little
   * rate variation and the shared room.
   */
  sample(options: SampleOptions): void {
    const context = this.ensure();
    const source = context.createBufferSource();
    const envelope = context.createGain();
    const rate = Math.min(4, Math.max(0.25, options.rate ?? 1));

    source.buffer = options.buffer;
    source.playbackRate.setValueAtTime(rate, options.time);
    envelope.gain.setValueAtTime(
      Math.max(MIN_GAIN, options.level),
      options.time,
    );

    source.connect(envelope);
    this.route(envelope, options.pan ?? 0, options.send ?? 0);
    source.start(options.time);
    source.stop(options.time + options.buffer.duration / rate + 0.02);
  }

  /** Inharmonic partial stack: bells, coins, glass, struck metal. */
  partials(options: PartialsOptions): void {
    const spread = options.spread ?? 0;
    options.ratios.forEach((ratio, index) => {
      const detune = spread ? this.range(-spread, spread) / 1200 : 0;
      this.tone({
        time: options.time + index * 0.0015,
        level: options.level / (1 + index * 0.85),
        frequency: options.frequency * ratio * (1 + detune),
        duration: options.decay / (1 + index * 0.32),
        attack: 0.002,
        type: options.type ?? "sine",
        pan: options.pan ?? 0,
        send: options.send ?? 0.2,
      });
    });
  }
}
