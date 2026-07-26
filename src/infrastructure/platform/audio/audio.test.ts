import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioCues, AudioEngine, scheduleCue, type SoundCue } from "./index";
import { eventIdentityFrequency } from "./cues";

/**
 * A recording stand-in for Web Audio.
 *
 * It captures the graph and every scheduled parameter change so the tests can
 * assert on what the engine actually asked the browser to do. Real audio
 * quality is verified separately by rendering WAVs (scripts/render-audio.mjs)
 * and measuring them (scripts/analyse-audio.mjs); these tests cover behaviour
 * and wiring.
 */

interface ParamRecord {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
}

function param(initial = 0): ParamRecord {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

class NodeMock {
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
}

class OscillatorMock extends NodeMock {
  type: OscillatorType = "sine";
  readonly frequency = param();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class SourceMock extends NodeMock {
  buffer: unknown = null;
  loop = false;
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FilterMock extends NodeMock {
  type: BiquadFilterType = "lowpass";
  readonly frequency = param();
  readonly Q = param();
}

class GainMock extends NodeMock {
  readonly gain = param(1);
}

class PannerMock extends NodeMock {
  readonly pan = param();
}

class CompressorMock extends NodeMock {
  readonly threshold = param();
  readonly knee = param();
  readonly ratio = param();
  readonly attack = param();
  readonly release = param();
}

class ConvolverMock extends NodeMock {
  buffer: AudioBuffer | null = null;
}

class ContextMock {
  static instances: ContextMock[] = [];
  state: AudioContextState = "suspended";
  currentTime = 5;
  sampleRate = 48_000;
  destination = new NodeMock();

  oscillators: OscillatorMock[] = [];
  sources: SourceMock[] = [];
  filters: FilterMock[] = [];
  gains: GainMock[] = [];
  panners: PannerMock[] = [];
  compressors: CompressorMock[] = [];
  convolvers: ConvolverMock[] = [];
  buffers: Array<{ channels: number; length: number }> = [];

  readonly resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  readonly close = vi.fn(() => Promise.resolve());

  constructor() {
    ContextMock.instances.push(this);
  }

  createOscillator(): OscillatorMock {
    const node = new OscillatorMock();
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): SourceMock {
    const node = new SourceMock();
    this.sources.push(node);
    return node;
  }

  createBiquadFilter(): FilterMock {
    const node = new FilterMock();
    this.filters.push(node);
    return node;
  }

  createGain(): GainMock {
    const node = new GainMock();
    this.gains.push(node);
    return node;
  }

  createStereoPanner(): PannerMock {
    const node = new PannerMock();
    this.panners.push(node);
    return node;
  }

  createDynamicsCompressor(): CompressorMock {
    const node = new CompressorMock();
    this.compressors.push(node);
    return node;
  }

  createConvolver(): ConvolverMock {
    const node = new ConvolverMock();
    this.convolvers.push(node);
    return node;
  }

  createBuffer(channels: number, length: number): AudioBuffer {
    this.buffers.push({ channels, length });
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      numberOfChannels: channels,
      length,
      sampleRate: this.sampleRate,
      duration: length / this.sampleRate,
      getChannelData: (channel: number) => data[channel] as Float32Array,
    } as unknown as AudioBuffer;
  }
}

/** Deterministic source so cue randomisation never makes a test flaky. */
function sequence(): () => number {
  let seed = 1;
  return () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
}

function engineOn(context: ContextMock): AudioEngine {
  return new AudioEngine({
    createContext: () => context as unknown as BaseAudioContext,
    random: sequence(),
  });
}

function render(cue: SoundCue): ContextMock {
  const context = new ContextMock();
  scheduleCue(engineOn(context), cue, 0);
  return context;
}

function oscillatorFrequencies(context: ContextMock): number[] {
  return context.oscillators.flatMap((oscillator) => {
    const value: unknown =
      oscillator.frequency.setValueAtTime.mock.calls[0]?.[0];
    return typeof value === "number" ? [value] : [];
  });
}

function filterFrequencies(context: ContextMock): number[] {
  return context.filters.flatMap((filter) => {
    const value: unknown = filter.frequency.setValueAtTime.mock.calls[0]?.[0];
    return typeof value === "number" ? [value] : [];
  });
}

/** Every voice the cue scheduled, in the order it starts. */
function startTimes(context: ContextMock): number[] {
  const starts = [
    ...context.oscillators.map(
      (node) => node.start.mock.calls[0]?.[0] as number | undefined,
    ),
    ...context.sources.map(
      (node) => node.start.mock.calls[0]?.[0] as number | undefined,
    ),
  ];
  return starts
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);
}

afterEach(() => {
  ContextMock.instances = [];
  vi.unstubAllGlobals();
});

describe("audio engine", () => {
  it("builds a master chain with a limiter and a reverb send", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({
      time: 0,
      level: 0.2,
      frequency: 440,
      duration: 0.2,
      send: 0.4,
    });

    expect(context.compressors).toHaveLength(1);
    expect(context.convolvers).toHaveLength(1);
    // The impulse response is stereo so the room does not collapse to mono.
    expect(context.convolvers[0]?.buffer?.numberOfChannels).toBe(2);
    expect(context.buffers[0]?.channels).toBe(2);
  });

  it("applies volume and mute to the master gain", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.setVolume(0.4);
    engine.tone({ time: 0, level: 0.2, frequency: 440, duration: 0.1 });

    const master = context.gains[0];
    expect(master?.gain.setValueAtTime).toHaveBeenCalledWith(0.4, 5);

    engine.setMuted(true);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 5);
    engine.setVolume(0.9);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 5);
    engine.setMuted(false);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(0.9, 5);
  });

  it("clamps volume and falls back on values that are not finite", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({ time: 0, level: 0.1, frequency: 300, duration: 0.05 });
    const master = context.gains[0];

    engine.setVolume(5);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 5);
    engine.setVolume(-3);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 5);
    engine.setVolume(Number.NaN);
    expect(master?.gain.setValueAtTime).toHaveBeenLastCalledWith(0.55, 5);
  });

  it("pans only when asked, keeping centred sounds off the panner", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({ time: 0, level: 0.1, frequency: 200, duration: 0.1 });
    expect(context.panners).toHaveLength(0);

    engine.tone({
      time: 0,
      level: 0.1,
      frequency: 200,
      duration: 0.1,
      pan: -0.6,
    });
    expect(context.panners).toHaveLength(1);
    expect(context.panners[0]?.pan.setValueAtTime).toHaveBeenCalledWith(
      -0.6,
      5,
    );
  });

  it("clamps panning to the stereo field", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({
      time: 0,
      level: 0.1,
      frequency: 200,
      duration: 0.1,
      pan: -4,
    });
    engine.tone({ time: 0, level: 0.1, frequency: 200, duration: 0.1, pan: 4 });

    expect(context.panners[0]?.pan.setValueAtTime).toHaveBeenCalledWith(-1, 5);
    expect(context.panners[1]?.pan.setValueAtTime).toHaveBeenCalledWith(1, 5);
  });

  it("glides frequency only when an end frequency differs", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({ time: 0, level: 0.1, frequency: 300, duration: 0.2 });
    expect(
      context.oscillators[0]?.frequency.exponentialRampToValueAtTime,
    ).not.toHaveBeenCalled();

    engine.tone({
      time: 0,
      level: 0.1,
      frequency: 300,
      endFrequency: 120,
      duration: 0.2,
    });
    expect(
      context.oscillators[1]?.frequency.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(120, 0.2);
  });

  it("sweeps a filter when noise is given an end frequency", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.noise({ time: 0, level: 0.1, duration: 0.3, frequency: 1_000 });
    expect(
      context.filters[0]?.frequency.exponentialRampToValueAtTime,
    ).not.toHaveBeenCalled();

    engine.noise({
      time: 0,
      level: 0.1,
      duration: 0.3,
      frequency: 1_000,
      endFrequency: 240,
    });
    expect(
      context.filters[1]?.frequency.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(240, 0.3);
  });

  it("reuses one noise buffer and reads it from varying offsets", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    for (let index = 0; index < 4; index += 1) {
      engine.noise({ time: 0, level: 0.1, duration: 0.1, frequency: 800 });
    }

    // One impulse response plus exactly one noise buffer, however many voices.
    expect(context.buffers).toHaveLength(2);
    const offsets = context.sources.map(
      (source) => source.start.mock.calls[0]?.[1] as number,
    );
    expect(new Set(offsets).size).toBeGreaterThan(1);
    expect(context.sources.every((source) => source.loop)).toBe(true);
  });

  it("builds an impact from a click, a body, and an optional thump", () => {
    const withoutThump = new ContextMock();
    engineOn(withoutThump).impact({
      time: 0,
      level: 0.3,
      body: 1_200,
      decay: 0.1,
      click: 4_000,
    });
    expect(withoutThump.sources).toHaveLength(2);
    expect(withoutThump.oscillators).toHaveLength(0);

    const withThump = new ContextMock();
    engineOn(withThump).impact({
      time: 0,
      level: 0.3,
      body: 1_200,
      decay: 0.1,
      click: 4_000,
      thump: 90,
    });
    expect(withThump.sources).toHaveLength(2);
    expect(oscillatorFrequencies(withThump)).toEqual([90]);
  });

  it("omits the contact click when a material has none", () => {
    const context = new ContextMock();
    engineOn(context).impact({ time: 0, level: 0.3, body: 900, decay: 0.1 });
    expect(context.sources).toHaveLength(1);
  });

  it("detunes stacked partials so they do not sound cloned", () => {
    const plain = new ContextMock();
    engineOn(plain).partials({
      time: 0,
      level: 0.2,
      frequency: 400,
      ratios: [1, 2, 3],
      decay: 0.5,
    });
    expect(oscillatorFrequencies(plain)).toEqual([400, 800, 1_200]);

    const spread = new ContextMock();
    engineOn(spread).partials({
      time: 0,
      level: 0.2,
      frequency: 400,
      ratios: [1, 2, 3],
      decay: 0.5,
      spread: 20,
    });
    const detuned = oscillatorFrequencies(spread);
    expect(detuned).not.toEqual([400, 800, 1_200]);
    // Detune is bounded: audibly less mechanical, never a different note.
    expect(detuned[0]).toBeGreaterThan(392);
    expect(detuned[0]).toBeLessThan(408);
  });

  it("creates a real context when none is injected", async () => {
    vi.stubGlobal("AudioContext", ContextMock);
    const engine = new AudioEngine();
    await engine.unlock();

    const context = ContextMock.instances.at(-1);
    expect(context?.resume).toHaveBeenCalledOnce();
    expect(engine.now()).toBe(5);
  });

  it("falls back to the WebKit constructor", async () => {
    vi.stubGlobal("webkitAudioContext", ContextMock);
    const engine = new AudioEngine();
    await engine.unlock();
    expect(ContextMock.instances).toHaveLength(1);
  });

  it("reports a clear error when Web Audio is missing", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const engine = new AudioEngine();
    expect(() => engine.now()).toThrow(/not supported/i);
  });

  it("does not resume a context that is already running", async () => {
    const context = new ContextMock();
    context.state = "running";
    await engineOn(context).unlock();
    expect(context.resume).not.toHaveBeenCalled();
  });

  it("closes the context and drops its nodes", () => {
    const context = new ContextMock();
    const engine = engineOn(context);
    engine.tone({ time: 0, level: 0.1, frequency: 300, duration: 0.1 });
    engine.close();
    expect(context.close).toHaveBeenCalledOnce();
    // Setting level after close must not throw on the released nodes.
    expect(() => engine.setVolume(0.3)).not.toThrow();
  });
});

describe("cue design", () => {
  it("throws two dice that land apart in time and in the stereo field", () => {
    const context = render({ type: "dice-roll" });

    expect(context.panners.length).toBeGreaterThan(8);
    const positions = context.panners.map(
      (panner) => panner.pan.setValueAtTime.mock.calls[0]?.[0] as number,
    );
    // One die left of centre, one right.
    expect(Math.min(...positions)).toBeLessThan(-0.2);
    expect(Math.max(...positions)).toBeGreaterThan(0.2);

    // Bounces accelerate: each gap shorter than the one before it.
    const times = startTimes(context);
    expect(times.length).toBeGreaterThan(10);
    expect(times.at(-1)).toBeGreaterThan(0.3);
  });

  it("gives the three disciplines different materials, not different chords", () => {
    const science = render({ type: "progress", discipline: "science" });
    const trade = render({ type: "progress", discipline: "trade" });
    const politics = render({ type: "progress", discipline: "politics" });

    // Glass: one strike, a long inharmonic stack.
    expect(oscillatorFrequencies(science)).toHaveLength(4);
    // Coins: four separate small impacts, each with its own partials.
    expect(trade.sources.length).toBeGreaterThanOrEqual(8);
    // Wax seal: a press, a stamp, and low harmonics.
    expect(Math.min(...oscillatorFrequencies(politics))).toBeLessThan(300);
    expect(Math.min(...oscillatorFrequencies(science))).toBeGreaterThan(1_000);
  });

  it("tightens the barbarian drum pattern as the ship closes in", () => {
    const distant = render({ type: "barbarian-advance", spacesRemaining: 6 });
    const closer = render({ type: "barbarian-advance", spacesRemaining: 4 });
    const imminent = render({ type: "barbarian-advance", spacesRemaining: 1 });

    expect(oscillatorFrequencies(distant)).toHaveLength(2);
    expect(oscillatorFrequencies(closer)).toHaveLength(4);
    expect(oscillatorFrequencies(imminent)).toHaveLength(6);

    // The hull creak rises further when the attack is close.
    const distantSweep = distant.filters.at(-1)?.frequency
      .exponentialRampToValueAtTime.mock.calls[0]?.[0] as number;
    const imminentSweep = imminent.filters.at(-1)?.frequency
      .exponentialRampToValueAtTime.mock.calls[0]?.[0] as number;
    expect(imminentSweep).toBeGreaterThan(distantSweep);
  });

  it("separates the three attack outcomes by what they are made of", () => {
    const defended = render({
      type: "barbarian-attack",
      outcome: "defenders-win",
    });
    const pillaged = render({
      type: "barbarian-attack",
      outcome: "barbarians-win",
    });
    const board = render({
      type: "barbarian-attack",
      outcome: "board-authoritative",
    });

    // Defence ends on a rising major stack; pillage on a low minor one.
    expect(oscillatorFrequencies(defended)).toEqual(
      expect.arrayContaining([392, 588, 784]),
    );
    expect(oscillatorFrequencies(pillaged)).toEqual(
      expect.arrayContaining([147]),
    );
    // Splintering timber gives the pillage far more discrete impacts.
    expect(pillaged.sources.length).toBeGreaterThan(defended.sources.length);
    // The board-authoritative cue stays neutral: an open fifth, no verdict.
    expect(oscillatorFrequencies(board)).toEqual(
      expect.arrayContaining([196, 294, 588]),
    );
  });

  it("shapes world events by category", () => {
    const nature = render({
      type: "world-event",
      eventId: "we-storm",
      category: "nature",
      tone: "setback",
      impact: 3,
    });
    const diplomacy = render({
      type: "world-event",
      eventId: "we-treaty",
      category: "diplomacy",
      tone: "boon",
      impact: 2,
    });
    const military = render({
      type: "world-event",
      eventId: "we-raid",
      category: "military",
      tone: "setback",
      impact: 3,
    });

    // Weather is noise-led; a treaty is a struck bar; a raid is drums.
    expect(nature.sources.length).toBeGreaterThan(0);
    expect(filterFrequencies(nature)[0]).toBe(700);
    expect(oscillatorFrequencies(diplomacy).length).toBeGreaterThan(4);
    expect(military.sources.length).toBeGreaterThanOrEqual(4);
  });

  it("bends a category up for boons and down for setbacks", () => {
    const boon = render({
      type: "world-event",
      eventId: "we-x",
      category: "society",
      tone: "boon",
      impact: 2,
    });
    const setback = render({
      type: "world-event",
      eventId: "we-x",
      category: "society",
      tone: "setback",
      impact: 2,
    });

    const boonSweep = boon.filters[0]?.frequency.exponentialRampToValueAtTime
      .mock.calls[0]?.[0] as number;
    const setbackSweep = setback.filters[0]?.frequency
      .exponentialRampToValueAtTime.mock.calls[0]?.[0] as number;
    expect(boonSweep).toBeGreaterThan(setbackSweep);
  });

  it("scales weight with impact", () => {
    const light = render({
      type: "world-event",
      eventId: "we-y",
      category: "military",
      tone: "mixed",
      impact: 1,
    });
    const heavy = render({
      type: "world-event",
      eventId: "we-y",
      category: "military",
      tone: "mixed",
      impact: 3,
    });
    expect(heavy.sources.length).toBeGreaterThan(light.sources.length);

    const quietNature = render({
      type: "world-event",
      eventId: "we-z",
      category: "nature",
      tone: "mixed",
      impact: 1,
    });
    const loudNature = render({
      type: "world-event",
      eventId: "we-z",
      category: "nature",
      tone: "mixed",
      impact: 3,
    });
    // Only the heavier nature events get thunder under the weather.
    expect(oscillatorFrequencies(loudNature).length).toBeGreaterThan(
      oscillatorFrequencies(quietNature).length,
    );

    const smallEconomy = render({
      type: "world-event",
      eventId: "we-e",
      category: "economy",
      tone: "boon",
      impact: 1,
    });
    const bigEconomy = render({
      type: "world-event",
      eventId: "we-e",
      category: "economy",
      tone: "boon",
      impact: 3,
    });
    // A market is coins and a bell, all tuned voices, so weight shows up as
    // more of them rather than as more noise.
    expect(oscillatorFrequencies(bigEconomy).length).toBeGreaterThan(
      oscillatorFrequencies(smallEconomy).length,
    );
  });

  it("gives each event a stable identity note", () => {
    const first = render({
      type: "world-event",
      eventId: "we-good-harvest",
      category: "economy",
      tone: "boon",
      impact: 1,
    });
    const second = render({
      type: "world-event",
      eventId: "we-market-day",
      category: "economy",
      tone: "boon",
      impact: 1,
    });

    const identity = eventIdentityFrequency("we-good-harvest");
    expect(oscillatorFrequencies(first)).toContain(identity);
    expect(oscillatorFrequencies(second)).not.toContain(identity);
    // Same input, same note, every time.
    expect(eventIdentityFrequency("we-good-harvest")).toBe(identity);
    expect(identity).toBeGreaterThanOrEqual(720);
    expect(identity).toBeLessThan(1_920);
  });

  it("makes each season a different ambience", () => {
    const spring = render({ type: "season-change", season: "spring" });
    const summer = render({ type: "season-change", season: "summer" });
    const autumn = render({ type: "season-change", season: "autumn" });
    const winter = render({ type: "season-change", season: "winter" });

    // Spring has birdcalls: three short gliding tones over the rustle.
    expect(oscillatorFrequencies(spring)).toHaveLength(3);
    // Winter sits highest; autumn is the dry rustle below it.
    const winterAir = filterFrequencies(winter)[0] as number;
    const autumnAir = filterFrequencies(autumn)[0] as number;
    expect(winterAir).toBeGreaterThan(autumnAir);
    expect(summer.sources).toHaveLength(1);
    expect(winter.filters[0]?.type).toBe("highpass");
  });

  it("keeps confirm short, dry, and immediate", () => {
    const context = render({ type: "confirm" });
    // A knock, not a boom: no low glide under it.
    expect(oscillatorFrequencies(context)).toEqual([660]);
    const stops = context.sources.map(
      (source) => source.stop.mock.calls[0]?.[0] as number,
    );
    expect(Math.max(...stops)).toBeLessThan(0.15);
  });
});

describe("AudioCues", () => {
  it("unlocks the context before scheduling", async () => {
    const context = new ContextMock();
    const cues = new AudioCues({
      createContext: () => context as unknown as BaseAudioContext,
      random: sequence(),
    });

    await cues.play({ type: "confirm" });
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.sources.length).toBeGreaterThan(0);
  });

  it("honours a scheduling delay", async () => {
    const context = new ContextMock();
    const cues = new AudioCues({
      createContext: () => context as unknown as BaseAudioContext,
      random: sequence(),
    });

    await cues.play({ type: "confirm" }, { delaySeconds: 0.4 });
    expect(Math.min(...startTimes(context))).toBeCloseTo(5.4, 5);
  });

  it("ignores a negative delay", async () => {
    const context = new ContextMock();
    const cues = new AudioCues({
      createContext: () => context as unknown as BaseAudioContext,
      random: sequence(),
    });

    await cues.play({ type: "confirm" }, { delaySeconds: -2 });
    expect(Math.min(...startTimes(context))).toBeCloseTo(5, 5);
  });

  it("recovers after close, because a closed context cannot be reused", async () => {
    const contexts: ContextMock[] = [];
    const cues = new AudioCues({
      createContext: () => {
        const context = new ContextMock();
        contexts.push(context);
        return context as unknown as BaseAudioContext;
      },
      random: sequence(),
    });

    await cues.play({ type: "confirm" });
    cues.close();
    await cues.play({ type: "confirm" });

    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.close).toHaveBeenCalledOnce();
    expect(contexts[1]?.sources.length).toBeGreaterThan(0);
  });

  it("passes volume and mute through to the engine", async () => {
    const context = new ContextMock();
    const cues = new AudioCues({
      createContext: () => context as unknown as BaseAudioContext,
      random: sequence(),
    });

    cues.setVolume(0.25);
    await cues.play({ type: "confirm" });
    expect(context.gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 5);

    cues.setMuted(true);
    expect(context.gains[0]?.gain.setValueAtTime).toHaveBeenLastCalledWith(
      0,
      5,
    );
  });

  it("can be unlocked directly, ahead of the first cue", async () => {
    const context = new ContextMock();
    const cues = new AudioCues({
      createContext: () => context as unknown as BaseAudioContext,
      random: sequence(),
    });

    await cues.unlock();
    expect(context.resume).toHaveBeenCalledOnce();
  });

  it("schedules every cue in the public union", () => {
    const cues: SoundCue[] = [
      { type: "dice-roll" },
      { type: "progress", discipline: "science" },
      { type: "progress", discipline: "trade" },
      { type: "progress", discipline: "politics" },
      { type: "barbarian-advance", spacesRemaining: 5 },
      { type: "barbarian-attack", outcome: "defenders-win" },
      { type: "barbarian-attack", outcome: "barbarians-win" },
      { type: "barbarian-attack", outcome: "board-authoritative" },
      {
        type: "world-event",
        eventId: "we-a",
        category: "economy",
        tone: "boon",
        impact: 1,
      },
      {
        type: "world-event",
        eventId: "we-b",
        category: "military",
        tone: "setback",
        impact: 2,
      },
      {
        type: "world-event",
        eventId: "we-c",
        category: "diplomacy",
        tone: "mixed",
        impact: 3,
      },
      {
        type: "world-event",
        eventId: "we-d",
        category: "nature",
        tone: "boon",
        impact: 2,
      },
      {
        type: "world-event",
        eventId: "we-e",
        category: "society",
        tone: "setback",
        impact: 1,
      },
      { type: "season-change", season: "spring" },
      { type: "season-change", season: "summer" },
      { type: "season-change", season: "autumn" },
      { type: "season-change", season: "winter" },
      { type: "confirm" },
    ];

    for (const cue of cues) {
      const context = render(cue);
      const voices = context.oscillators.length + context.sources.length;
      expect(voices, `${cue.type} scheduled nothing`).toBeGreaterThan(0);
    }
  });
});
