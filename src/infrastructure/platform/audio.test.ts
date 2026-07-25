import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioCues, type SoundCue } from "./audio";

function parameterMock() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

interface OscillatorRecord {
  type: OscillatorType;
  frequency: ReturnType<typeof parameterMock>;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state: AudioContextState = "suspended";
  currentTime = 10;
  sampleRate = 8_000;
  destination = {};
  oscillators: OscillatorRecord[] = [];
  gains: Array<{
    gain: ReturnType<typeof parameterMock>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  sources: Array<{
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  filters: Array<{
    type: BiquadFilterType;
    frequency: ReturnType<typeof parameterMock>;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  readonly resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  readonly close = vi.fn(() => Promise.resolve());

  constructor() {
    AudioContextMock.instances.push(this);
  }

  createOscillator(): OscillatorRecord {
    const oscillator: OscillatorRecord = {
      type: "sine",
      frequency: parameterMock(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = {
      gain: parameterMock(),
      connect: vi.fn(),
    };
    this.gains.push(gain);
    return gain;
  }

  createBuffer(_channels: number, frameCount: number) {
    return {
      getChannelData: vi.fn(() => new Float32Array(frameCount)),
    };
  }

  createBufferSource() {
    const source = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = {
      type: "lowpass" as BiquadFilterType,
      frequency: parameterMock(),
      connect: vi.fn(),
    };
    this.filters.push(filter);
    return filter;
  }
}

function firstFrequency(context: AudioContextMock): number | undefined {
  return context.oscillators[0]?.frequency.setValueAtTime.mock.calls[0]?.[0] as
    number | undefined;
}

function scheduledFrequencies(context: AudioContextMock): number[] {
  return context.oscillators.flatMap((oscillator) => {
    const value: unknown =
      oscillator.frequency.setValueAtTime.mock.calls[0]?.[0];
    return typeof value === "number" ? [value] : [];
  });
}

async function renderCue(cue: SoundCue): Promise<AudioContextMock> {
  const audio = new AudioCues();
  await audio.play(cue);
  return AudioContextMock.instances.at(-1) as AudioContextMock;
}

describe("AudioCues", () => {
  afterEach(() => {
    AudioContextMock.instances = [];
    vi.unstubAllGlobals();
  });

  it("unlocks Web Audio and synthesizes a physical dice roll", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);

    const context = await renderCue({ type: "dice-roll" });

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.sources.length).toBeGreaterThanOrEqual(8);
    expect(context.filters.length).toBeGreaterThanOrEqual(8);
    expect(context.oscillators.length).toBeGreaterThanOrEqual(9);
    expect(context.gains[0]?.connect).toHaveBeenCalledWith(context.destination);
  });

  it("gives science, trade, and politics distinct progress signatures", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);

    const science = await renderCue({
      type: "progress",
      discipline: "science",
    });
    const trade = await renderCue({ type: "progress", discipline: "trade" });
    const politics = await renderCue({
      type: "progress",
      discipline: "politics",
    });

    expect(firstFrequency(science)).toBe(659);
    expect(firstFrequency(trade)).toBe(1047);
    expect(firstFrequency(politics)).toBe(262);
    expect(science.oscillators[0]?.type).toBe("sine");
    expect(trade.oscillators[0]?.type).toBe("triangle");
    expect(politics.oscillators[0]?.type).toBe("sawtooth");
  });

  it("raises barbarian urgency and distinguishes the attack outcome", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);

    const distant = await renderCue({
      type: "barbarian-advance",
      spacesRemaining: 5,
    });
    const imminent = await renderCue({
      type: "barbarian-advance",
      spacesRemaining: 1,
    });
    const defended = await renderCue({
      type: "barbarian-attack",
      outcome: "defenders-win",
    });
    const pillaged = await renderCue({
      type: "barbarian-attack",
      outcome: "barbarians-win",
    });
    const boardAuthoritative = await renderCue({
      type: "barbarian-attack",
      outcome: "board-authoritative",
    });

    expect(imminent.oscillators.length).toBeGreaterThan(
      distant.oscillators.length,
    );
    expect(defended.sources.length).toBeGreaterThanOrEqual(4);
    expect(pillaged.sources.length).toBeGreaterThanOrEqual(4);
    const defendedFinal = defended.oscillators.at(-1);
    const pillagedFinal = pillaged.oscillators.at(-1);
    expect(defendedFinal?.frequency.setValueAtTime.mock.calls[0]?.[0]).toBe(
      294,
    );
    expect(pillagedFinal?.frequency.setValueAtTime.mock.calls[0]?.[0]).toBe(
      147,
    );
    expect(
      boardAuthoritative.oscillators.at(-1)?.frequency.setValueAtTime.mock
        .calls[0]?.[0],
    ).toBe(196);
  });

  it("layers World Events by category, tone, and impact", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);

    const smallBoon = await renderCue({
      type: "world-event",
      eventId: "we-good-harvest",
      category: "economy",
      tone: "boon",
      impact: 1,
    });
    const otherBoon = await renderCue({
      type: "world-event",
      eventId: "we-market-day",
      category: "economy",
      tone: "boon",
      impact: 1,
    });
    const majorSetback = await renderCue({
      type: "world-event",
      eventId: "we-earthquake",
      category: "nature",
      tone: "setback",
      impact: 3,
    });

    expect(firstFrequency(smallBoon)).toBe(523);
    expect(firstFrequency(majorSetback)).toBe(220);
    expect(scheduledFrequencies(smallBoon)[2]).not.toBe(
      scheduledFrequencies(otherBoon)[2],
    );
    expect(scheduledFrequencies(majorSetback)).toEqual(
      expect.arrayContaining([110, 330]),
    );
    expect(majorSetback.sources).toHaveLength(1);
  });

  it("supports volume, delay, close/recreate, and the WebKit constructor", async () => {
    vi.stubGlobal("webkitAudioContext", AudioContextMock);
    const audio = new AudioCues();
    audio.setVolume(2);

    await audio.play({ type: "confirm" }, { delaySeconds: 0.25 });
    const first = AudioContextMock.instances[0] as AudioContextMock;
    expect(first.gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(1, 10);
    expect(first.oscillators[0]?.start).toHaveBeenCalledWith(10.25);

    audio.setMuted(true);
    expect(first.gains[0]?.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    audio.setVolume(0.8);
    expect(first.gains[0]?.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    audio.setMuted(false);
    expect(first.gains[0]?.gain.setValueAtTime).toHaveBeenLastCalledWith(
      0.8,
      10,
    );
    audio.close();
    expect(first.close).toHaveBeenCalledOnce();

    await audio.play({ type: "season-change", season: "winter" });
    expect(AudioContextMock.instances).toHaveLength(2);
    expect(AudioContextMock.instances[1]?.sources).toHaveLength(1);
  });

  it("does not resume an already-running context", async () => {
    class RunningAudioContext extends AudioContextMock {
      override state: AudioContextState = "running";
    }
    vi.stubGlobal("AudioContext", RunningAudioContext);

    const context = await renderCue({ type: "confirm" });

    expect(context.resume).not.toHaveBeenCalled();
  });
});
