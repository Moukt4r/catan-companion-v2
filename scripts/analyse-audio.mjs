/**
 * Measures rendered cue WAVs so the pack can be judged on evidence rather
 * than on how the design code reads.
 *
 * Reports, per cue: spectral centroid (perceived brightness), transient count
 * (how percussive it is), stereo width, and attack time.
 *
 * Usage: node scripts/analyse-audio.mjs [dir]
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "/tmp/audio-preview");

function readWav(buffer) {
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  let offset = 12;
  let dataStart = 44;
  let dataLength = buffer.length - 44;
  while (offset < buffer.length - 8) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      dataStart = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size;
  }
  const frames = Math.floor(dataLength / (2 * channels));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const base = dataStart + frame * channels * 2;
    left[frame] = buffer.readInt16LE(base) / 32768;
    right[frame] =
      channels > 1 ? buffer.readInt16LE(base + 2) / 32768 : left[frame];
  }
  return { left, right, sampleRate };
}

/**
 * Goertzel magnitude at one frequency.
 *
 * Runs over every sample on purpose. An earlier version skipped samples to go
 * faster, which silently decimated the signal: it aliased everything above the
 * reduced Nyquist rate while still computing the coefficient from the original
 * sample rate. That made the centroid meaningless and produced two false
 * design failures.
 */
function magnitudeAt(samples, sampleRate, frequency) {
  const k = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const s0 = samples[index] + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coefficient * s1 * s2);
}

/**
 * The renderer schedules every cue this far into the buffer so the very first
 * sample is never a discontinuity. Attack times are measured from the cue, not
 * from the start of the file, so the lead-in has to come back off.
 */
const RENDER_LEAD_IN = 0.05;

const BANDS = [60, 110, 200, 350, 600, 1000, 1800, 3000, 5000, 8000, 12000];

function analyse(name, wav) {
  const { left, right, sampleRate } = wav;
  const mono = new Float32Array(left.length);
  for (let index = 0; index < left.length; index += 1) {
    mono[index] = (left[index] + right[index]) / 2;
  }

  const magnitudes = BANDS.map((frequency) => ({
    frequency,
    magnitude: magnitudeAt(mono, sampleRate, frequency),
  }));
  const totalMagnitude =
    magnitudes.reduce((sum, b) => sum + b.magnitude, 0) || 1;
  const centroid =
    magnitudes.reduce((sum, b) => sum + b.frequency * b.magnitude, 0) /
    totalMagnitude;

  // Envelope in 5 ms windows, used for transients and attack time.
  const windowSize = Math.floor(sampleRate * 0.005);
  const envelope = [];
  for (let index = 0; index + windowSize <= mono.length; index += windowSize) {
    let peak = 0;
    for (let offset = 0; offset < windowSize; offset += 1) {
      const value = Math.abs(mono[index + offset]);
      if (value > peak) peak = value;
    }
    envelope.push(peak);
  }
  const globalPeak = Math.max(...envelope, 0.000001);

  let transients = 0;
  for (let index = 1; index < envelope.length; index += 1) {
    const jump = envelope[index] - envelope[index - 1];
    if (jump > globalPeak * 0.18 && envelope[index] > globalPeak * 0.22) {
      transients += 1;
    }
  }

  const attackIndex = envelope.findIndex((value) => value >= globalPeak * 0.9);
  const attack = Math.max(
    0,
    (attackIndex < 0 ? 0 : attackIndex) * 0.005 - RENDER_LEAD_IN,
  );

  let differenceEnergy = 0;
  let sumEnergy = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    const sum = left[index] + right[index];
    differenceEnergy += difference * difference;
    sumEnergy += sum * sum;
  }
  const width = Math.sqrt(differenceEnergy / (sumEnergy || 1));

  return { name, centroid, transients, attack, width };
}

const files = (await readdir(dir))
  .filter((file) => file.endsWith(".wav"))
  .sort();
const rows = [];
for (const file of files) {
  const wav = readWav(await readFile(path.join(dir, file)));
  rows.push(analyse(file.replace(/\.wav$/, ""), wav));
}

console.log(
  "\ncue                              centroid  transients  attack  width",
);
console.log("".padEnd(74, "-"));
for (const row of rows) {
  console.log(
    `${row.name.padEnd(32)} ${Math.round(row.centroid).toString().padStart(6)}Hz ` +
      `${row.transients.toString().padStart(8)}  ` +
      `${row.attack.toFixed(3)}s  ${row.width.toFixed(3)}`,
  );
}

// Design expectations, checked rather than assumed.
const checks = [
  {
    label: "dice roll is percussive (many transients)",
    pass: (rows.find((r) => r.name === "dice-roll")?.transients ?? 0) >= 4,
  },
  {
    label: "dice roll is stereo (two dice, two positions)",
    pass: (rows.find((r) => r.name === "dice-roll")?.width ?? 0) > 0.05,
  },
  {
    label: "seasons swell rather than strike (slow attack)",
    pass: ["season-spring", "season-summer", "season-winter"].every(
      (name) => (rows.find((r) => r.name === name)?.attack ?? 0) > 0.02,
    ),
  },
  {
    label: "science reads brighter than politics",
    pass:
      (rows.find((r) => r.name === "progress-science")?.centroid ?? 0) >
      (rows.find((r) => r.name === "progress-politics")?.centroid ?? 0),
  },
  {
    label: "winter reads brighter than autumn",
    pass:
      (rows.find((r) => r.name === "season-winter")?.centroid ?? 0) >
      (rows.find((r) => r.name === "season-autumn")?.centroid ?? 0),
  },
  {
    label: "barbarian attack is low and heavy",
    pass:
      (rows.find((r) => r.name === "barbarian-attack-pillaged")?.centroid ??
        9999) < 1200,
  },
  {
    label: "near barbarians hit harder than distant ones",
    pass:
      (rows.find((r) => r.name === "barbarian-advance-near")?.transients ??
        0) >=
      (rows.find((r) => r.name === "barbarian-advance-far")?.transients ?? 0),
  },
  {
    label: "confirm is short and immediate",
    pass: (rows.find((r) => r.name === "confirm")?.attack ?? 9) < 0.05,
  },
];

console.log("");
let failed = 0;
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.label}`);
  if (!check.pass) failed += 1;
}
console.log(
  failed
    ? `\n${failed} design expectation(s) not met`
    : "\nall design expectations met",
);
process.exit(failed ? 1 : 0);
