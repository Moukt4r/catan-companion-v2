import {
  WORLD_EVENT_ART,
  worldEventIllustration,
} from "../../illustrationCatalog";
import type {
  WorldEventCategory,
  WorldEventDuration,
  WorldEventTone,
} from "../../../domain";

export interface WorldEventGuideEntry {
  id: string;
  title: string;
  instruction: string;
  tone: WorldEventTone;
  toneLabel: string;
  impact: number;
  category: WorldEventCategory;
  duration: WorldEventDuration;
  timingCopy: string;
  /** True once this event has been drawn in the current deck cycle. */
  drawn: boolean;
}

export interface WorldEventGuideView {
  enabled: boolean;
  totalCount: number;
  entries: WorldEventGuideEntry[];
  /**
   * Deck progress for a game in play. Null when browsing the reference
   * catalog outside a game, where "seen this year" has no meaning.
   */
  deck: { percent: number; cycle: number; drawnCount: number } | null;
}

const CATEGORY_LABELS: Record<WorldEventCategory, string> = {
  economy: "Economy",
  military: "Military",
  diplomacy: "Diplomacy",
  nature: "Nature",
  society: "Society",
};

const CATEGORY_ORDER: WorldEventCategory[] = [
  "economy",
  "military",
  "diplomacy",
  "nature",
  "society",
];

/**
 * The grouped event list shared by the in-game dialog and the standalone
 * reference page, so both always describe an event the same way.
 */
export function WorldEventGuideList({ view }: { view: WorldEventGuideView }) {
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    entries: view.entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0);

  return (
    <>
      {grouped.map((group) => (
        <section
          className="event-guide-group"
          key={group.category}
          aria-label={CATEGORY_LABELS[group.category]}
        >
          <h3>{CATEGORY_LABELS[group.category]}</h3>
          <ul className="event-guide-list">
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                className={`event-guide-card event-guide-card--${entry.tone}${
                  entry.drawn ? " event-guide-card--drawn" : ""
                }`}
              >
                <img
                  className="event-guide-card__art"
                  src={worldEventIllustration(entry.id)}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  onError={(imageEvent) => {
                    imageEvent.currentTarget.onerror = null;
                    imageEvent.currentTarget.src =
                      WORLD_EVENT_ART[entry.category];
                  }}
                />
                <div className="event-guide-card__body">
                  <div className="event-guide-card__header">
                    <strong>{entry.title}</strong>
                    {entry.drawn ? (
                      <span className="event-guide-card__seen">
                        Seen this year
                      </span>
                    ) : null}
                  </div>
                  <p>{entry.instruction}</p>
                  <p className="event-guide-card__meta">
                    {entry.toneLabel} · Impact {entry.impact} / 3 ·{" "}
                    {entry.timingCopy}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
