/**
 * Turns a directory of rendered one-shots into the assets a sampled sound pack
 * ships.
 *
 * The pack format is deliberately boring: one Opus file per asset name, in
 * `public/sfx/<pack>/`. Opus because it is the best-sounding codec at small
 * sizes that every current browser decodes, and because a full pack lands well
 * under a single illustration.
 *
 * The script *repairs* rather than merely complains. Source renders routinely
 * carry a few tens of milliseconds of silence in front — a compressor's
 * lookahead, a scheduler's first block — and that silence is audible lag when a
 * die hits the table. So every asset is trimmed to its onset, faded out to kill
 * end clicks, and peak-normalised before encoding. Only if a clip is still
 * wrong after repair is it treated as a failure.
 *
 * Usage: node scripts/build-sound-pack.mjs <sourceDir> [packId]
 */

import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/** Must match `sampleAssetNames` in src/application/soundPacks.ts. */
const REQUIRED_ASSETS = [
  "dice-roll",
  "progress-trade",
  "progress-science",
  "progress-politics",
  "barbarian-advance-far",
  "barbarian-advance-near",
  "barbarian-attack-board",
  "barbarian-attack-defended",
  "barbarian-attack-pillaged",
  "event-economy-boon",
  "event-diplomacy-boon",
  "event-military-setback",
  "event-nature-setback",
  "event-society-mixed",
  "season-spring",
  "season-summer",
  "season-autumn",
  "season-winter",
  "confirm",
];

/**
 * A cue must begin the instant it is triggered. This is the tolerance checked
 * *after* trimming; anything above it means the trim failed to find the onset.
 */
const MAX_LEAD_SILENCE_MS = 12;

/** Below this the clip is treated as effectively silent, which is a bug. */
const MIN_PEAK_DBFS = -30;

/** Total pack budget. Generous, but it should never creep toward the art. */
const MAX_PACK_BYTES = 512 * 1024;

const sourceDir = path.resolve(process.argv[2] ?? "");
const packId = process.argv[3] ?? "hearth";
const outputDir = path.join(root, "public", "sfx", packId);

if (!process.argv[2]) {
  console.error(
    "Usage: node scripts/build-sound-pack.mjs <sourceDir> [packId]",
  );
  process.exit(1);
}

async function main() {
  const available = new Set(
    (await readdir(sourceDir))
      .filter((name) => name.endsWith(".wav"))
      .map((name) => name.replace(/\.wav$/, "")),
  );

  const missing = REQUIRED_ASSETS.filter((name) => !available.has(name));
  if (missing.length > 0) {
    console.error(
      `✗ Source is missing ${missing.length} required asset(s):\n  ${missing.join("\n  ")}`,
    );
    process.exit(1);
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const rows = [];
  const problems = [];

  for (const name of REQUIRED_ASSETS) {
    const input = path.join(sourceDir, `${name}.wav`);
    const output = path.join(outputDir, `${name}.opus`);

    const sourceLead = await leadSilenceMs(input);
    const sourcePeak = await peakDbfs(input);

    if (sourcePeak < MIN_PEAK_DBFS) {
      problems.push(
        `${name}: peaks at ${sourcePeak.toFixed(1)} dBFS, which is effectively silent`,
      );
    }

    // Repair, then encode, in one pass:
    //  - silenceremove drops the leading silence so the cue starts on contact
    //  - afade out over the last 15 ms prevents a click on an abrupt tail
    //  - alimiter with a unity ceiling normalises peaks without pumping
    // 96 kbps stereo VBR is transparent for short foley. `-application audio`
    // rather than `voip`, since none of this is speech.
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-af",
      [
        "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0",
        "areverse",
        "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05",
        "areverse",
        "afade=t=out:d=0.015:curve=exp",
        "alimiter=limit=0.891:level=false",
      ].join(","),
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      "-vbr",
      "on",
      "-application",
      "audio",
      "-ar",
      "48000",
      "-ac",
      "2",
      output,
    ]);

    const lead = await leadSilenceMs(output);
    if (lead > MAX_LEAD_SILENCE_MS) {
      problems.push(
        `${name}: still starts ${lead.toFixed(0)} ms late after trimming (max ${MAX_LEAD_SILENCE_MS} ms)`,
      );
    }

    const { size } = await stat(output);
    const duration = await durationSeconds(output);
    if (!Number.isFinite(duration) || duration <= 0.05) {
      problems.push(
        `${name}: trimmed to ${duration.toFixed(3)}s, which is too short to be a cue`,
      );
    }
    rows.push({ name, bytes: size, duration, leadMs: lead, sourceLead });
  }

  const total = rows.reduce((sum, row) => sum + row.bytes, 0);

  for (const row of rows) {
    console.log(
      `  ${row.name.padEnd(28)} ${(row.bytes / 1024).toFixed(1).padStart(6)} KB  ${row.duration.toFixed(2)}s  trimmed ${row.sourceLead.toFixed(0)}ms`,
    );
  }
  console.log(
    `\n  ${rows.length} assets, ${(total / 1024).toFixed(1)} KB total (budget ${(MAX_PACK_BYTES / 1024).toFixed(0)} KB)`,
  );

  if (total > MAX_PACK_BYTES) {
    problems.push(
      `pack is ${(total / 1024).toFixed(1)} KB, over the ${(MAX_PACK_BYTES / 1024).toFixed(0)} KB budget`,
    );
  }

  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        pack: packId,
        generatedAt: new Date().toISOString(),
        totalBytes: total,
        assets: rows.map((row) => ({
          name: row.name,
          bytes: row.bytes,
          seconds: Number(row.duration.toFixed(3)),
        })),
      },
      null,
      2,
    )}\n`,
  );

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ Wrote ${packId} to public/sfx/${packId}`);
}

/**
 * Milliseconds of silence before the cue actually begins.
 *
 * Parsed carefully on purpose. An earlier version tested the report with
 * `/silence_start: (-?0(\.0+)?)\b/`, which happily matched the `0` inside
 * `silence_start: 0.907` because there is a word boundary between the digit and
 * the decimal point. Every trimmed file then looked like it began with almost a
 * second of silence. Capture the whole number, then compare numerically.
 */
async function leadSilenceMs(file) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    file,
    "-af",
    "silencedetect=noise=-50dB:d=0.005",
    "-f",
    "null",
    "-",
  ]);

  const starts = [
    ...stderr.matchAll(/silence_start: (-?[0-9]+(?:\.[0-9]+)?)/g),
  ];
  const first = starts[0];
  // Silence that begins later in the file is a gap inside the cue, not lag in
  // front of it.
  if (!first || Number(first[1]) > 0.001) {
    return 0;
  }

  const end = /silence_end: ([0-9]+(?:\.[0-9]+)?)/.exec(stderr);
  return end ? Number(end[1]) * 1000 : 0;
}

/** Peak level of the whole file, in dBFS. */
async function peakDbfs(file) {
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    file,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const match = /max_volume: (-?[0-9.]+) dB/.exec(stderr);
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
}

async function durationSeconds(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(stdout.trim());
}

await main();
