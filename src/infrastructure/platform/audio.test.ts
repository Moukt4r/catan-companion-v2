import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioCues } from "./audio";

interface OscillatorRecord {
  type: OscillatorType;
  frequency: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state: AudioContextState = "suspended";
  currentTime = 10;
  destination = {};
  oscillators: OscillatorRecord[] = [];
  gains: Array<{
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
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
      frequency: vi.fn(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscillator.frequency = Object.assign(oscillator.frequency, {
      setValueAtTime: oscillator.frequency,
    });
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    this.gains.push(gain);
    return gain;
  }
}

describe("AudioCues", () => {
  afterEach(() => {
    AudioContextMock.instances = [];
    vi.unstubAllGlobals();
  });

  it("resumes audio and schedules each frequency in a cue", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);
    const cues = new AudioCues();

    await cues.play("roll");

    const context = AudioContextMock.instances[0];
    expect(context?.resume).toHaveBeenCalledOnce();
    expect(context?.oscillators).toHaveLength(3);
    expect(context?.gains).toHaveLength(3);
    expect(context?.oscillators[0]?.frequency).toHaveBeenCalledWith(220, 10);
    expect(context?.oscillators[2]?.start).toHaveBeenCalledWith(10.14);
    expect(
      context?.oscillators.every((oscillator) => oscillator.type === "sine"),
    ).toBe(true);
  });

  it("uses square oscillators for advance and recreates a closed context", async () => {
    vi.stubGlobal("AudioContext", AudioContextMock);
    const cues = new AudioCues();

    await cues.play("advance");
    expect(
      AudioContextMock.instances[0]?.oscillators.every(
        (oscillator) => oscillator.type === "square",
      ),
    ).toBe(true);
    cues.close();
    expect(AudioContextMock.instances[0]?.close).toHaveBeenCalledOnce();

    await cues.play("confirm");
    expect(AudioContextMock.instances).toHaveLength(2);
    cues.close();
  });

  it("does not resume an already-running context", async () => {
    class RunningAudioContext extends AudioContextMock {
      override state: AudioContextState = "running";
    }
    vi.stubGlobal("AudioContext", RunningAudioContext);

    await new AudioCues().play("event");

    expect(AudioContextMock.instances[0]?.resume).not.toHaveBeenCalled();
    expect(AudioContextMock.instances[0]?.oscillators).toHaveLength(3);
  });
});
