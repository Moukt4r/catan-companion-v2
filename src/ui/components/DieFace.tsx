import { EVENT_DIE_ART } from "../illustrationCatalog";

interface DieFaceProps {
  value: number | "barbarian" | "science" | "trade" | "politics" | null;
  kind: "red" | "yellow" | "event";
  label: string;
  rolling?: boolean;
}

const eventSymbols = {
  barbarian: "Ship",
  politics: "Politics",
  science: "Science",
  trade: "Trade",
};

export function DieFace({ kind, label, rolling = false, value }: DieFaceProps) {
  const display =
    typeof value === "number"
      ? String(value)
      : value
        ? eventSymbols[value]
        : "-";

  // The physical event die is colour-coded: green science, yellow trade, blue
  // politics and a black barbarian ship. Match it so the die reads at a glance
  // from across the table instead of relying on the artwork alone.
  const faceClass =
    kind === "event" && typeof value === "string" ? ` die--face-${value}` : "";

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
