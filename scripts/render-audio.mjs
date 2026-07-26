/**
 * Offline renderer for the audio pack.
 *
 * Runs the real cue code inside a real browser's OfflineAudioContext through
 * Playwright, then writes WAV files. This is how the pack gets verified: by
 * listening and by measuring, not by trusting that the code reads well.
 *
 * Usage: node scripts/render-audio.mjs [outputDir]
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outputDir = path.resolve(
  process.argv[2] ?? path.join(root, "audio-preview"),
);

/** The cue list to render, with how long each needs to fully decay. */
const CUES = [
  { name: "dice-roll", seconds: 2.6, cue: { type: "dice-roll" } },
  {
    name: "progress-science",
    seconds: 2.6,
    cue: { type: "progress", discipline: "science" },
  },
  {
    name: "progress-trade",
    seconds: 2.2,
    cue: { type: "progress", discipline: "trade" },
  },
  {
    name: "progress-politics",
    seconds: 2.2,
    cue: { type: "progress", discipline: "politics" },
  },
  {
    name: "barbarian-advance-far",
    seconds: 2.6,
    cue: { type: "barbarian-advance", spacesRemaining: 6 },
  },
  {
    name: "barbarian-advance-near",
    seconds: 2.6,
    cue: { type: "barbarian-advance", spacesRemaining: 1 },
  },
  {
    name: "barbarian-attack-defended",
    seconds: 3.4,
    cue: { type: "barbarian-attack", outcome: "defenders-win" },
  },
  {
    name: "barbarian-attack-pillaged",
    seconds: 3.4,
    cue: { type: "barbarian-attack", outcome: "barbarians-win" },
  },
  {
    name: "barbarian-attack-board",
    seconds: 3.4,
    cue: { type: "barbarian-attack", outcome: "board-authoritative" },
  },
  {
    name: "event-economy-boon",
    seconds: 2.8,
    cue: {
      type: "world-event",
      eventId: "we-market-day",
      category: "economy",
      tone: "boon",
      impact: 2,
    },
  },
  {
    name: "event-military-setback",
    seconds: 2.8,
    cue: {
      type: "world-event",
      eventId: "we-raid",
      category: "military",
      tone: "setback",
      impact: 3,
    },
  },
  {
    name: "event-diplomacy-boon",
    seconds: 3.0,
    cue: {
      type: "world-event",
      eventId: "we-treaty",
      category: "diplomacy",
      tone: "boon",
      impact: 2,
    },
  },
  {
    name: "event-nature-setback",
    seconds: 3.2,
    cue: {
      type: "world-event",
      eventId: "we-earthquake",
      category: "nature",
      tone: "setback",
      impact: 3,
    },
  },
  {
    name: "event-society-mixed",
    seconds: 2.8,
    cue: {
      type: "world-event",
      eventId: "we-festival",
      category: "society",
      tone: "mixed",
      impact: 2,
    },
  },
  {
    name: "season-spring",
    seconds: 2.6,
    cue: { type: "season-change", season: "spring" },
  },
  {
    name: "season-summer",
    seconds: 2.8,
    cue: { type: "season-change", season: "summer" },
  },
  {
    name: "season-autumn",
    seconds: 2.6,
    cue: { type: "season-change", season: "autumn" },
  },
  {
    name: "season-winter",
    seconds: 3.2,
    cue: { type: "season-change", season: "winter" },
  },
  { name: "confirm", seconds: 1.2, cue: { type: "confirm" } },
];

/** Interleaved float samples to a 16-bit PCM WAV. */
function encodeWav(channels, sampleRate) {
  const frames = channels[0].length;
  const channelCount = channels.length;
  const dataBytes = frames * channelCount * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * 2, 28);
  buffer.writeUInt16LE(channelCount * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += 2;
    }
  }
  return buffer;
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  // Serve the built ES modules so the browser can import the real cue code.
  const server = createServer(async (request, response) => {
    try {
      const requested = decodeURIComponent((request.url ?? "/").split("?")[0]);
      const file = path.join(root, requested);
      if (!file.startsWith(root)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { "content-type": "text/javascript" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") console.error("  browser:", message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/scripts/render-audio-host.html`);

  const measurements = [];
  for (const entry of CUES) {
    const rendered = await page.evaluate(
      // Runs inside the browser, where OfflineAudioContext is a page global.
      async ({ cue, seconds, port }) => {
        const module = await import(
          `http://127.0.0.1:${port}/dist-audio/index.js`
        );
        const sampleRate = 48000;
        const context = new OfflineAudioContext(
          2,
          Math.ceil(sampleRate * seconds),
          sampleRate,
        );
        // A fixed seed keeps renders reproducible run to run.
        let seed = 12345;
        const random = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const engine = new module.AudioEngine({
          createContext: () => context,
          random,
        });
        engine.setVolume(0.9);
        module.scheduleCue(engine, cue, 0.05);
        const buffer = await context.startRendering();
        return {
          left: Array.from(buffer.getChannelData(0)),
          right: Array.from(buffer.getChannelData(1)),
          sampleRate: buffer.sampleRate,
        };
      },
      { cue: entry.cue, seconds: entry.seconds, port },
    );

    const left = Float32Array.from(rendered.left);
    const right = Float32Array.from(rendered.right);

    let peak = 0;
    let sumSquares = 0;
    let lastAudible = 0;
    for (let index = 0; index < left.length; index += 1) {
      const value = Math.max(Math.abs(left[index]), Math.abs(right[index]));
      if (value > peak) peak = value;
      sumSquares += value * value;
      if (value > 0.0015) lastAudible = index;
    }
    const rms = Math.sqrt(sumSquares / left.length);

    await writeFile(
      path.join(outputDir, `${entry.name}.wav`),
      encodeWav([left, right], rendered.sampleRate),
    );

    measurements.push({
      name: entry.name,
      peak,
      rms,
      tail: lastAudible / rendered.sampleRate,
      clipped: peak >= 0.999,
      silent: peak < 0.01,
    });
  }

  await browser.close();
  server.close();

  console.log(
    "\ncue                              peak     rms    length  flags",
  );
  console.log("".padEnd(70, "-"));
  for (const item of measurements) {
    const flags = [
      item.clipped ? "CLIPPED" : "",
      item.silent ? "SILENT" : "",
      item.tail < 0.15 ? "VERY-SHORT" : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `${item.name.padEnd(32)} ${item.peak.toFixed(3)}  ${item.rms.toFixed(4)}  ${item.tail.toFixed(2)}s  ${flags}`,
    );
  }

  const problems = measurements.filter((m) => m.clipped || m.silent);
  console.log(
    `\n${measurements.length} cues rendered to ${outputDir}` +
      (problems.length
        ? ` — ${problems.length} need attention`
        : " — all clean"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
