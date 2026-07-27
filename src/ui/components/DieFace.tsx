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
}

const eventSymbols = {
  barbarian: "Ship",
  politics: "Politics",
  science: "Science",
  trade: "Trade",
};

export function DieFace({
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
              <span className="die__event-caption">{eventSymbols[value]}</span>
            </>
          ) : (
            <span className="die__event-placeholder">?</span>
          )}
        </span>
      )}
    </div>
  );
}
