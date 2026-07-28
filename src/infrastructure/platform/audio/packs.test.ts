import { describe, expect, it, vi } from "vitest";
import {
  defaultSoundPackId,
  findSoundPack,
  sampleAssetNames,
  soundPacks,
  type SampleAssetName,
} from "../../../application/soundPacks";
import { SampleLibrary } from "./sampleLibrary";
import { selectSample } from "./sampleSelection";
import type { SoundCue } from "./cueTypes";
import type { AudioEngine } from "./engine";

/**
 * These cover the pack layer: which asset a cue resolves to, and how the
 * library behaves when the network misbehaves. The synthesized voices are
 * covered in `audio.test.ts`, and the actual sound quality is verified by
 * rendering and measuring WAVs (`scripts/render-audio.mjs`).
 */

function engineStub(): AudioEngine {
  return {
    decode: vi.fn(() =>
      Promise.resolve({ duration: 1 } as unknown as AudioBuffer),
    ),
  } as unknown as AudioEngine;
}

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

/** A fetcher that always succeeds, recorded so call counts can be asserted. */
function okFetch() {
  return vi.fn(() => Promise.resolve(okResponse()));
}

const hearth = findSoundPack("hearth");

describe("sound packs", () => {
  it("exposes a synthesized default that needs no assets", () => {
    const pack = findSoundPack(defaultSoundPackId);
    expect(pack.kind).toBe("synth");
    expect(pack.assetDirectory).toBeUndefined();
  });

  it("gives every pack a distinct id, label and description", () => {
    const ids = new Set(soundPacks.map((pack) => pack.id));
    const labels = new Set(soundPacks.map((pack) => pack.label));
    expect(ids.size).toBe(soundPacks.length);
    expect(labels.size).toBe(soundPacks.length);
    for (const pack of soundPacks) {
      expect(pack.description.length).toBeGreaterThan(20);
    }
  });

  it("gives every sampled pack an asset directory", () => {
    for (const pack of soundPacks) {
      if (pack.kind === "sampled") {
        expect(pack.assetDirectory).toBeTruthy();
      }
    }
  });

  it("rejects an unknown pack id", () => {
    expect(() => findSoundPack("nope" as never)).toThrow(/Unknown sound pack/);
  });
});

describe("sample selection", () => {
  const stable = () => 0.5;

  /** Every cue shape, so no branch can resolve to nothing. */
  const cues: SoundCue[] = [
    { type: "dice-roll" },
    { type: "progress", discipline: "trade" },
    { type: "progress", discipline: "science" },
    { type: "progress", discipline: "politics" },
    { type: "barbarian-advance", spacesRemaining: 7 },
    { type: "barbarian-advance", spacesRemaining: 1 },
    { type: "barbarian-attack", outcome: "defenders-win" },
    { type: "barbarian-attack", outcome: "barbarians-win" },
    { type: "barbarian-attack", outcome: "board-authoritative" },
    { type: "season-change", season: "spring" },
    { type: "season-change", season: "summer" },
    { type: "season-change", season: "autumn" },
    { type: "season-change", season: "winter" },
    { type: "confirm" },
  ];

  it("resolves every cue to an asset the pack actually ships", () => {
    const known = new Set<string>(sampleAssetNames);
    for (const cue of cues) {
      const selection = selectSample(cue, stable);
      expect(known.has(selection.asset)).toBe(true);
    }
  });

  it("resolves every world-event category and tone", () => {
    const categories = [
      "diplomacy",
      "economy",
      "military",
      "nature",
      "society",
    ] as const;
    const tones = ["boon", "mixed", "setback"] as const;
    const known = new Set<string>(sampleAssetNames);

    for (const category of categories) {
      for (const tone of tones) {
        const selection = selectSample(
          { type: "world-event", eventId: "e", category, tone, impact: 2 },
          stable,
        );
        expect(known.has(selection.asset)).toBe(true);
      }
    }
  });

  it("scales world-event level with impact", () => {
    const levels = ([1, 2, 3] as const).map(
      (impact) =>
        selectSample(
          {
            type: "world-event",
            eventId: "e",
            category: "economy",
            tone: "boon",
            impact,
          },
          stable,
        ).level,
    );
    expect(levels[0]).toBeLessThan(levels[1] as number);
    expect(levels[1]).toBeLessThan(levels[2] as number);
  });

  it("makes an approaching ship louder and faster than a distant one", () => {
    const far = selectSample(
      { type: "barbarian-advance", spacesRemaining: 7 },
      stable,
    );
    const near = selectSample(
      { type: "barbarian-advance", spacesRemaining: 0 },
      stable,
    );

    expect(far.asset).toBe("barbarian-advance-far");
    expect(near.asset).toBe("barbarian-advance-near");
    expect(near.level).toBeGreaterThan(far.level);
    expect(near.rate).toBeGreaterThan(far.rate);
  });

  it("keeps rate jitter small enough to stay recognisable", () => {
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      const selection = selectSample({ type: "dice-roll" }, () => value);
      expect(selection.rate).toBeGreaterThan(0.98);
      expect(selection.rate).toBeLessThan(1.02);
    }
  });

  it("varies the rate between plays so repeats are not cloned", () => {
    const first = selectSample({ type: "dice-roll" }, () => 0.1).rate;
    const second = selectSample({ type: "dice-roll" }, () => 0.9).rate;
    expect(first).not.toBe(second);
  });
});

describe("sample library", () => {
  it("fetches, decodes and caches an asset once", async () => {
    const fetcher = okFetch();
    const engine = engineStub();
    const library = new SampleLibrary(hearth, { fetch: fetcher, baseUrl: "/" });

    await library.load(engine, "dice-roll");
    await library.load(engine, "dice-roll");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/sfx/hearth/dice-roll.opus");
    expect(library.status("dice-roll")).toBe("ready");
    expect(library.get("dice-roll")).not.toBeNull();
  });

  it("honours a base path so subdirectory deployments resolve", async () => {
    const fetcher = okFetch();
    const library = new SampleLibrary(hearth, {
      fetch: fetcher,
      baseUrl: "/catan/",
    });

    await library.load(engineStub(), "confirm");

    expect(fetcher).toHaveBeenCalledWith("/catan/sfx/hearth/confirm.opus");
  });

  it("gives up quietly on a missing asset and does not retry it", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404 } as unknown as Response),
    );
    const library = new SampleLibrary(hearth, { fetch: fetcher, baseUrl: "/" });

    await library.load(engineStub(), "dice-roll");
    await library.load(engineStub(), "dice-roll");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(library.status("dice-roll")).toBe("failed");
    expect(library.get("dice-roll")).toBeNull();
  });

  it("survives a rejected request", async () => {
    const library = new SampleLibrary(hearth, {
      fetch: () => Promise.reject(new Error("offline")),
      baseUrl: "/",
    });

    await expect(
      library.load(engineStub(), "confirm"),
    ).resolves.toBeUndefined();
    expect(library.status("confirm")).toBe("failed");
  });

  it("survives an undecodable payload", async () => {
    const engine = {
      decode: vi.fn(() => Promise.reject(new Error("bad audio data"))),
    } as unknown as AudioEngine;
    const library = new SampleLibrary(hearth, {
      fetch: () => Promise.resolve(okResponse()),
      baseUrl: "/",
    });

    await library.load(engine, "confirm");

    expect(library.status("confirm")).toBe("failed");
  });

  it("shares one request between concurrent loads", async () => {
    const fetcher = okFetch();
    const library = new SampleLibrary(hearth, { fetch: fetcher, baseUrl: "/" });
    const engine = engineStub();

    await Promise.all([
      library.load(engine, "dice-roll"),
      library.load(engine, "dice-roll"),
      library.load(engine, "dice-roll"),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("primes several assets at once", async () => {
    const fetcher = okFetch();
    const library = new SampleLibrary(hearth, { fetch: fetcher, baseUrl: "/" });
    const names: SampleAssetName[] = ["dice-roll", "confirm"];

    await library.prime(engineStub(), names);

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const name of names) {
      expect(library.status(name)).toBe("ready");
    }
  });

  it("reports idle for an asset nobody has asked for", () => {
    const library = new SampleLibrary(hearth, {
      fetch: () => Promise.resolve(okResponse()),
      baseUrl: "/",
    });
    expect(library.status("season-winter")).toBe("idle");
  });
});
