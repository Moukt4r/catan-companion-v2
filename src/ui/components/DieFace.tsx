import { useEffect, useRef, useState } from "react";
import { EVENT_DIE_ART } from "../illustrationCatalog";

type DieEventFace = "barbarian" | "science" | "trade" | "politics";

interface DieFaceProps {
  value: number | DieEventFace | null;
  kind: "red" | "yellow" | "event";
  label: string;
  rolling?: boolean;
  /**
   * Face rolled on the event die. The numbered red die is tinted to match it so
   * both halves of a roll read as a single result from across the table.
   */
  eventFace?: DieEventFace | null;
  /**
   * Tumble the die in 3D before settling. The result is always the value the
   * deck already drew; the animation only decides how it gets there.
   */
  animated?: boolean;
}

const eventSymbols = {
  barbarian: "Ship",
  politics: "Politics",
  science: "Science",
  trade: "Trade",
};

/**
 * Resting rotation that brings each numbered face toward the viewer.
 *
 * The cube is built from six absolutely positioned faces, so landing on a
 * result is a matter of rotating the shared parent to the matching angle
 * rather than animating the faces themselves.
 */
const NUMBER_REST: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

/** Event faces occupy the same six positions; three sides carry the ship. */
const EVENT_REST: Record<DieEventFace, { x: number; y: number }> = {
  barbarian: { x: 0, y: 0 },
  science: { x: 0, y: -90 },
  trade: { x: -90, y: 0 },
  politics: { x: 0, y: 90 },
};

const NUMBER_ORDER = [1, 2, 3, 4, 5, 6] as const;
const EVENT_ORDER: DieEventFace[] = [
  "barbarian",
  "science",
  "trade",
  "barbarian",
  "politics",
  "barbarian",
];

/** Whole extra spins added while tumbling, so the die visibly rotates. */
const SPIN_TURNS = 3;

/**
 * Shrink while airborne. A rotating cube sweeps its own diagonal, roughly 1.7x
 * its width, which otherwise pushes the dice out over the edge of the roll
 * stage. Applied to the cube rather than the die: the die carries `perspective`,
 * and a transform on that same element flattens the child's 3D context in
 * Chromium, which silently disables backface-visibility and lets the rear faces
 * show through as mirrored numbers.
 */
const TUMBLE_SCALE = 0.62;

export function DieFace({
  animated = false,
  eventFace = null,
  kind,
  label,
  rolling = false,
  value,
}: DieFaceProps) {
  const display =
    typeof value === "number"
      ? String(value)
      : value
        ? eventSymbols[value]
        : "-";

  // The physical event die is colour-coded: green science, yellow trade, blue
  // politics and a black barbarian ship. Match it so the die reads at a glance
  // from across the table instead of relying on the artwork alone. The numbered
  // red die borrows the same tint once an event has been drawn, which pairs the
  // two dice visually; before the first roll it stays neutral.
  const face =
    kind === "event" && typeof value === "string"
      ? value
      : kind === "red"
        ? eventFace
        : null;
  const faceClass = face ? ` die--face-${face}` : "";

  if (!animated) {
    return (
      <div
        className={`die die--${kind}${faceClass}${rolling ? " die--rolling" : ""}`}
        role="img"
        aria-label={`${label}: ${display}`}
      >
        {typeof value === "number" ? (
          <span className="die__number" aria-hidden>
            {value}
          </span>
        ) : (
          <span className="die__event" aria-hidden>
            {value ? (
              <>
                <img
                  className="die__event-art"
                  src={EVENT_DIE_ART[value]}
                  alt=""
                  decoding="async"
                />
                <span className="die__event-caption">
                  {eventSymbols[value]}
                </span>
              </>
            ) : (
              <span className="die__event-placeholder">?</span>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <Die3D
      kind={kind}
      faceClass={faceClass}
      label={label}
      display={display}
      rolling={rolling}
      value={value}
    />
  );
}

interface Die3DProps {
  kind: "red" | "yellow" | "event";
  faceClass: string;
  label: string;
  display: string;
  rolling: boolean;
  value: number | DieEventFace | null;
}

function Die3D({
  display,
  faceClass,
  kind,
  label,
  rolling,
  value,
}: Die3DProps) {
  const rest = restingRotation(value);
  // Accumulate turns so the cube always spins forward into its result rather
  // than unwinding back to a smaller angle.
  const spins = useRef(0);
  const [angle, setAngle] = useState(rest);
  const scale = rolling ? TUMBLE_SCALE : 1;

  useEffect(() => {
    if (rolling) {
      spins.current += SPIN_TURNS;
    }
    setAngle({
      x: rest.x + spins.current * 360,
      y: rest.y + spins.current * 360,
    });
  }, [rolling, rest.x, rest.y]);

  return (
    <div
      className={`die die--3d die--${kind}${faceClass}${rolling ? " die--tumbling" : ""}`}
      role="img"
      aria-label={`${label}: ${display}`}
    >
      <div
        className="die3d__cube"
        style={{
          transform: `rotateX(${angle.x}deg) rotateY(${angle.y}deg) scale3d(${scale}, ${scale}, ${scale})`,
        }}
        aria-hidden
      >
        {kind === "event"
          ? EVENT_ORDER.map((eventValue, index) => (
              <span
                className={`die3d__face die3d__face--${index} die--face-${eventValue}`}
                key={index}
              >
                <img
                  className="die__event-art"
                  src={EVENT_DIE_ART[eventValue]}
                  alt=""
                  decoding="async"
                />
                <span className="die__event-caption">
                  {eventSymbols[eventValue]}
                </span>
              </span>
            ))
          : NUMBER_ORDER.map((pips, index) => (
              <span className={`die3d__face die3d__face--${index}`} key={pips}>
                <span className="die__number">{pips}</span>
              </span>
            ))}
      </div>
    </div>
  );
}

function restingRotation(value: number | DieEventFace | null): {
  x: number;
  y: number;
} {
  if (typeof value === "number") {
    return NUMBER_REST[value] ?? { x: 0, y: 0 };
  }
  if (value) {
    return EVENT_REST[value];
  }
  return { x: 0, y: 0 };
}
