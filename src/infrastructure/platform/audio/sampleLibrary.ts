/**
 * Loads and caches the one-shot assets a sampled pack is built from.
 *
 * Design notes:
 *
 * - Loading is lazy and per asset. A table that never triggers a barbarian
 *   attack never downloads the barbarian clips.
 * - A failed or undecodable asset is remembered as failed, not retried on every
 *   play, and the caller falls back to the synth voice for that cue.
 * - Nothing here throws into the play path. Sound is an enhancement; a missing
 *   file must never interrupt a game.
 */

import type { AudioEngine } from "./engine";
import type {
  SampleAssetName,
  SoundPackDefinition,
} from "../../../application/soundPacks";

type Fetcher = (input: string) => Promise<Response>;

export interface SampleLibraryOptions {
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: Fetcher;
  /** Prefix for asset URLs. Defaults to the Vite base path. */
  baseUrl?: string;
}

export class SampleLibrary {
  private readonly buffers = new Map<SampleAssetName, AudioBuffer>();
  private readonly pending = new Map<SampleAssetName, Promise<void>>();
  private readonly failed = new Set<SampleAssetName>();
  private readonly fetcher: Fetcher;
  private readonly baseUrl: string;

  constructor(
    private readonly pack: SoundPackDefinition,
    options: SampleLibraryOptions = {},
  ) {
    this.fetcher =
      options.fetch ?? ((input: string) => globalThis.fetch(input));
    this.baseUrl = options.baseUrl ?? defaultBaseUrl();
  }

  /** A decoded buffer, or null when the asset is missing, failed or still loading. */
  get(name: SampleAssetName): AudioBuffer | null {
    return this.buffers.get(name) ?? null;
  }

  /**
   * Ensures an asset is loading or loaded. Safe to call repeatedly and safe to
   * ignore the returned promise: callers that cannot wait simply fall back to
   * the synth voice for this playback and get the sample next time.
   */
  async load(engine: AudioEngine, name: SampleAssetName): Promise<void> {
    if (this.buffers.has(name) || this.failed.has(name)) {
      return;
    }
    const existing = this.pending.get(name);
    if (existing) {
      return await existing;
    }

    const directory = this.pack.assetDirectory;
    if (!directory) {
      this.failed.add(name);
      return;
    }

    const task = (async () => {
      try {
        const response = await this.fetcher(
          `${this.baseUrl}${directory}/${name}.opus`,
        );
        if (!response.ok) {
          throw new Error(`Sound asset request failed: ${response.status}`);
        }
        const data = await response.arrayBuffer();
        this.buffers.set(name, await engine.decode(data));
      } catch {
        // Remembered as failed so a broken deployment costs one request, not
        // one request per roll.
        this.failed.add(name);
      } finally {
        this.pending.delete(name);
      }
    })();

    this.pending.set(name, task);
    await task;
  }

  /** Warms the assets a table is most likely to hit within the first minute. */
  async prime(
    engine: AudioEngine,
    names: readonly SampleAssetName[],
  ): Promise<void> {
    await Promise.all(names.map(async (name) => await this.load(engine, name)));
  }

  /** Test and diagnostics helper. */
  status(name: SampleAssetName): "ready" | "failed" | "idle" {
    if (this.buffers.has(name)) return "ready";
    if (this.failed.has(name)) return "failed";
    return "idle";
  }
}

function defaultBaseUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}
