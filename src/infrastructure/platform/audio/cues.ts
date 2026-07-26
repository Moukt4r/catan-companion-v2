/**
 * Cue designs. Each function models what the sound physically *is* rather
 * than picking pleasant frequencies: dice are bone cubes tumbling on a wooden
 * table, barbarians are a war drum and a hull, coins are inharmonic metal.
 *
 * Timing is expressed in seconds relative to the cue start.
 */

import type { AudioEngine } from "./engine";

export type ProgressDisciplineSound = "politics" | "science" | "trade";
export type WorldEventCategorySound =
  "diplomacy" | "economy" | "military" | "nature" | "society";
export type WorldEventToneSound = "boon" | "mixed" | "setback";
export type SeasonSound = "spring" | "summer" | "autumn" | "winter";

/**
 * A die landing: it strikes, loses energy, strikes again sooner and quieter,
 * then rattles to rest. Bounce gaps shrink geometrically like a real bouncing
 * body, and each die gets its own pan position and timing so two dice never
 * sound like one doubled hit.
 */
function tumble(
  engine: AudioEngine,
  start: number,
  pan: number,
  energy: number,
): number {
  let time = start;
  let gap = engine.range(0.075, 0.1);
  let level = 0.5 * energy;
  let last = time;

  const bounces = 5;
  for (let index = 0; index < bounces; index += 1) {
    // Bone/resin dice ring in the low kilohertz; the table adds the thump.
    engine.impact({
      time,
      level,
      body: engine.range(1_450, 2_100),
      decay: 0.055 + engine.random() * 0.03,
      click: 5_200,
      thump: index < 3 ? engine.range(96, 132) : 0,
      pan: pan + engine.range(-0.08, 0.08),
      send: 0.16,
      q: 3.2,
    });
    last = time;
    time += gap;
    gap *= 0.62;
    level *= 0.54;
  }

  // The final settle: a short, dull scrape as the die rocks flat.
  engine.noise({
    time: last + 0.02,
    level: 0.05 * energy,
    duration: 0.09,
    filter: "bandpass",
    frequency: 780,
    endFrequency: 420,
    q: 1.6,
    pan,
    send: 0.2,
  });
  return last;
}

export function diceRoll(engine: AudioEngine, start: number): void {
  // Hand release: a brief shake before the dice leave the cup.
  engine.noise({
    time: start,
    level: 0.1,
    duration: 0.13,
    filter: "bandpass",
    frequency: 2_400,
    endFrequency: 1_500,
    q: 0.9,
    send: 0.1,
  });

  const first = tumble(engine, start + 0.12, -0.32, 1);
  const second = tumble(engine, start + 0.17, 0.34, 0.92);

  // The table itself responds to the whole event with a low body resonance.
  engine.tone({
    time: start + 0.12,
    level: 0.075,
    frequency: 74,
    endFrequency: 58,
    duration: 0.42,
    attack: 0.006,
    send: 0.3,
  });
  void first;
  void second;
}

/**
 * The three disciplines are three different objects, not three chords:
 * science is struck glass, trade is coins, politics is a wax seal on parchment.
 */
export function progress(
  engine: AudioEngine,
  start: number,
  discipline: ProgressDisciplineSound,
): void {
  switch (discipline) {
    case "science": {
      // Struck glass: bright, inharmonic, long shimmer.
      engine.impact({
        time: start,
        level: 0.18,
        body: 3_100,
        decay: 0.05,
        click: 7_000,
        send: 0.3,
        q: 7,
      });
      engine.partials({
        time: start,
        level: 0.15,
        frequency: 1_318,
        ratios: [1, 2.76, 5.4, 8.9],
        decay: 1.5,
        spread: 6,
        send: 0.45,
      });
      break;
    }
    case "trade": {
      // Coins: several small metal discs, each landing at its own moment.
      for (let index = 0; index < 4; index += 1) {
        const time = start + index * engine.range(0.035, 0.07);
        engine.partials({
          time,
          level: 0.11,
          frequency: engine.range(2_100, 3_200),
          ratios: [1, 2.41, 4.18, 6.9],
          decay: engine.range(0.35, 0.62),
          spread: 14,
          pan: engine.range(-0.4, 0.4),
          send: 0.34,
        });
        engine.impact({
          time,
          level: 0.09,
          body: engine.range(2_600, 3_600),
          decay: 0.03,
          click: 8_000,
          pan: engine.range(-0.3, 0.3),
          send: 0.2,
          q: 6,
        });
      }
      break;
    }
    case "politics": {
      // Wax seal: a soft press, then the low authority of a struck stamp.
      engine.noise({
        time: start,
        level: 0.12,
        duration: 0.1,
        filter: "lowpass",
        frequency: 900,
        endFrequency: 380,
        send: 0.18,
      });
      engine.impact({
        time: start + 0.05,
        level: 0.24,
        body: 260,
        decay: 0.16,
        click: 2_200,
        thump: 88,
        send: 0.34,
        q: 2.4,
      });
      engine.partials({
        time: start + 0.05,
        level: 0.09,
        frequency: 196,
        ratios: [1, 2, 3.02],
        decay: 0.7,
        send: 0.3,
      });
      break;
    }
  }
}

/**
 * The barbarian ship. A hull groan plus a war drum, and the closer it gets the
 * faster and tighter the drum pattern becomes.
 */
export function barbarianAdvance(
  engine: AudioEngine,
  start: number,
  spacesRemaining: number,
): void {
  const urgency = Math.min(1, Math.max(0, (7 - spacesRemaining) / 6));
  const beats = spacesRemaining <= 2 ? 3 : spacesRemaining <= 4 ? 2 : 1;
  const spacing = 0.3 - urgency * 0.1;

  for (let index = 0; index < beats; index += 1) {
    const time = start + index * spacing;
    // A big skin drum: low fundamental, short bright slap, long body.
    engine.impact({
      time,
      level: 0.3 + urgency * 0.12,
      body: 190,
      decay: 0.26,
      click: 1_500,
      thump: 62 - index * 2,
      send: 0.4,
      q: 1.8,
    });
    engine.tone({
      time,
      level: 0.16,
      frequency: 58,
      endFrequency: 41,
      duration: 0.5,
      attack: 0.002,
      glide: 0.7,
      send: 0.35,
    });
  }

  // Hull under strain: a slow, detuned creak that rises with urgency.
  engine.noise({
    time: start,
    level: 0.07 + urgency * 0.05,
    duration: 0.85,
    filter: "bandpass",
    frequency: 320,
    endFrequency: 520 + urgency * 260,
    q: 7,
    attack: 0.12,
    pan: -0.2,
    send: 0.45,
  });
}

export function barbarianAttack(
  engine: AudioEngine,
  start: number,
  outcome: "defenders-win" | "barbarians-win" | "board-authoritative",
): void {
  // Three accelerating war drums announce the landing.
  [0, 0.19, 0.34].forEach((offset, index) => {
    engine.impact({
      time: start + offset,
      level: 0.34 + index * 0.04,
      body: 175 - index * 12,
      decay: 0.3,
      click: 1_400,
      thump: 58 - index * 4,
      send: 0.42,
      q: 1.7,
    });
  });

  // Impact of the ship: a broad low roar with a long tail.
  engine.noise({
    time: start + 0.44,
    level: 0.2,
    duration: 0.75,
    filter: "lowpass",
    frequency: 1_100,
    endFrequency: 260,
    attack: 0.01,
    send: 0.55,
  });

  if (outcome === "defenders-win") {
    // Steel drawn and raised: bright, rising, confident.
    engine.noise({
      time: start + 0.5,
      level: 0.13,
      duration: 0.26,
      filter: "bandpass",
      frequency: 2_600,
      endFrequency: 5_200,
      q: 2.4,
      pan: 0.25,
      send: 0.4,
    });
    engine.partials({
      time: start + 0.62,
      level: 0.15,
      frequency: 392,
      ratios: [1, 1.5, 2, 3],
      decay: 1.25,
      send: 0.5,
    });
    return;
  }

  if (outcome === "barbarians-win") {
    // Timber splintering, then a sunken minor third.
    for (let index = 0; index < 5; index += 1) {
      engine.impact({
        time: start + 0.5 + index * engine.range(0.03, 0.075),
        level: 0.12,
        body: engine.range(700, 1_500),
        decay: 0.09,
        click: 3_800,
        pan: engine.range(-0.5, 0.5),
        send: 0.3,
        q: 3,
      });
    }
    engine.partials({
      time: start + 0.72,
      level: 0.15,
      frequency: 147,
      ratios: [1, 1.19, 2.02, 2.98],
      decay: 1.5,
      type: "triangle",
      send: 0.5,
    });
    return;
  }

  // Board-authoritative: the app does not know who won, so it only marks that
  // the attack resolved. A neutral, open fifth that resolves nowhere.
  engine.partials({
    time: start + 0.58,
    level: 0.14,
    frequency: 196,
    ratios: [1, 1.5, 3],
    decay: 1.15,
    send: 0.5,
  });
}

/**
 * World events read as weather and crowds rather than melodies. Category picks
 * the texture, tone bends it up or down, impact scales weight and length.
 */
export function worldEvent(
  engine: AudioEngine,
  start: number,
  eventId: string,
  category: WorldEventCategorySound,
  tone: WorldEventToneSound,
  impact: 1 | 2 | 3,
): void {
  const weight = 0.6 + impact * 0.22;
  const direction = tone === "boon" ? 1 : tone === "setback" ? -1 : 0;

  switch (category) {
    case "economy": {
      // A market: coins and a hand bell.
      for (let index = 0; index < 2 + impact; index += 1) {
        engine.partials({
          time: start + index * engine.range(0.03, 0.08),
          level: 0.08 * weight,
          frequency: engine.range(2_200, 3_400),
          ratios: [1, 2.41, 4.18],
          decay: engine.range(0.3, 0.55),
          spread: 12,
          pan: engine.range(-0.45, 0.45),
          send: 0.35,
        });
      }
      engine.partials({
        time: start + 0.1,
        level: 0.1 * weight,
        frequency: direction >= 0 ? 1_046 : 880,
        ratios: [1, 2.76, 5.4],
        decay: 1.1 + impact * 0.2,
        spread: 5,
        send: 0.45,
      });
      break;
    }
    case "military": {
      engine.impact({
        time: start,
        level: 0.26 * weight,
        body: 185,
        decay: 0.28,
        click: 1_300,
        thump: 60,
        send: 0.4,
        q: 1.8,
      });
      if (impact >= 2) {
        engine.impact({
          time: start + 0.21,
          level: 0.22 * weight,
          body: 168,
          decay: 0.26,
          click: 1_200,
          thump: 55,
          send: 0.4,
          q: 1.8,
        });
      }
      // Armour and blades in the distance.
      engine.noise({
        time: start + 0.06,
        level: 0.07 * weight,
        duration: 0.4,
        filter: "bandpass",
        frequency: 3_200,
        endFrequency: direction < 0 ? 1_800 : 4_200,
        q: 2.2,
        attack: 0.03,
        pan: 0.2,
        send: 0.4,
      });
      break;
    }
    case "diplomacy": {
      // A hall: a soft mallet on a bar, and room.
      engine.partials({
        time: start,
        level: 0.13 * weight,
        frequency: direction >= 0 ? 587 : 523,
        ratios: [1, 2.01, 3.02, 4.05],
        decay: 1.4 + impact * 0.25,
        spread: 4,
        send: 0.55,
      });
      engine.tone({
        time: start + 0.14,
        level: 0.06 * weight,
        frequency: direction >= 0 ? 880 : 784,
        duration: 0.9,
        attack: 0.06,
        send: 0.5,
      });
      break;
    }
    case "nature": {
      // Wind and rain, bent by tone. Setbacks growl; boons breathe.
      engine.noise({
        time: start,
        level: 0.12 * weight,
        duration: 1.1 + impact * 0.2,
        filter: direction < 0 ? "lowpass" : "bandpass",
        frequency: direction < 0 ? 700 : 1_400,
        endFrequency: direction < 0 ? 220 : 2_600,
        q: 1.1,
        attack: 0.18,
        send: 0.6,
      });
      if (impact >= 2) {
        // Distant thunder for the heavier events.
        engine.tone({
          time: start + 0.12,
          level: 0.14 * weight,
          frequency: 62,
          endFrequency: 38,
          duration: 1.2,
          attack: 0.05,
          glide: 0.8,
          send: 0.5,
        });
      }
      break;
    }
    case "society": {
      // A crowd: many small voices as filtered noise swells, plus a chime.
      engine.noise({
        time: start,
        level: 0.09 * weight,
        duration: 0.85,
        filter: "bandpass",
        frequency: 900,
        endFrequency: direction >= 0 ? 1_500 : 600,
        q: 1.4,
        attack: 0.2,
        send: 0.5,
      });
      engine.partials({
        time: start + 0.16,
        level: 0.1 * weight,
        frequency: direction >= 0 ? 784 : 659,
        ratios: [1, 2.4, 3.9],
        decay: 1.0,
        spread: 8,
        send: 0.45,
      });
      break;
    }
  }

  // A stable per-event overtone so repeat occurrences of the same event are
  // recognisable without shipping a separate asset for each one.
  engine.tone({
    time: start + 0.26,
    level: 0.035 + impact * 0.006,
    frequency: eventIdentityFrequency(eventId),
    duration: 0.5,
    attack: 0.04,
    send: 0.5,
  });
}

export function eventIdentityFrequency(eventId: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < eventId.length; index += 1) {
    hash ^= eventId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return 720 + (hash % 1_200);
}

/** Seasons are ambiences, not jingles. */
export function seasonChange(
  engine: AudioEngine,
  start: number,
  season: SeasonSound,
): void {
  switch (season) {
    case "spring": {
      // Birds over a soft rustle.
      engine.noise({
        time: start,
        level: 0.05,
        duration: 1.0,
        filter: "bandpass",
        frequency: 2_600,
        endFrequency: 3_600,
        q: 0.8,
        attack: 0.25,
        send: 0.55,
      });
      for (let index = 0; index < 3; index += 1) {
        engine.tone({
          time: start + 0.12 + index * engine.range(0.1, 0.2),
          level: 0.06,
          frequency: engine.range(2_200, 3_100),
          endFrequency: engine.range(3_200, 4_400),
          duration: 0.1,
          attack: 0.008,
          type: "sine",
          pan: engine.range(-0.5, 0.5),
          send: 0.6,
        });
      }
      break;
    }
    case "summer": {
      // Warm, still air and a low drone of insects.
      engine.noise({
        time: start,
        level: 0.055,
        duration: 1.2,
        filter: "bandpass",
        frequency: 1_100,
        q: 0.7,
        attack: 0.3,
        send: 0.55,
      });
      engine.partials({
        time: start + 0.1,
        level: 0.09,
        frequency: 523,
        ratios: [1, 1.5, 2, 2.5],
        decay: 1.5,
        spread: 5,
        send: 0.5,
      });
      break;
    }
    case "autumn": {
      // Dry leaves and a falling minor line. The rustle is deliberately kept
      // below winter's ice so the four seasons stay ordered by brightness.
      engine.noise({
        time: start,
        level: 0.06,
        duration: 0.8,
        filter: "bandpass",
        frequency: 1_900,
        endFrequency: 1_100,
        q: 0.9,
        attack: 0.05,
        send: 0.45,
      });
      engine.partials({
        time: start + 0.14,
        level: 0.1,
        frequency: 392,
        ratios: [1, 1.19, 2.02],
        decay: 1.4,
        type: "triangle",
        send: 0.5,
      });
      break;
    }
    case "winter": {
      // Thin wind and ice: the highest and sparsest of the four.
      engine.noise({
        time: start,
        level: 0.11,
        duration: 1.4,
        filter: "highpass",
        frequency: 4_200,
        endFrequency: 7_800,
        attack: 0.35,
        send: 0.65,
      });
      engine.partials({
        time: start + 0.16,
        level: 0.085,
        frequency: 2_093,
        ratios: [1, 2.76, 5.4, 8.9],
        decay: 1.8,
        spread: 7,
        send: 0.6,
      });
      break;
    }
  }
}

/**
 * A wooden piece set down on the board. Short, dry, satisfying.
 *
 * No low thump: a small wooden piece knocks, it does not boom, and the low
 * glide was pushing the loudest moment a few milliseconds past the contact.
 */
export function confirm(engine: AudioEngine, start: number): void {
  engine.impact({
    time: start,
    level: 0.24,
    body: 1_250,
    decay: 0.05,
    click: 4_200,
    send: 0.18,
    q: 3.4,
  });
  engine.tone({
    time: start + 0.012,
    level: 0.05,
    frequency: 660,
    duration: 0.1,
    attack: 0.003,
    send: 0.25,
  });
}
