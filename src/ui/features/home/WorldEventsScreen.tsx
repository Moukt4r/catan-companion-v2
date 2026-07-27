import { Button } from "../../components";
import {
  WorldEventGuideList,
  type WorldEventGuideView,
} from "../game/worldEventGuide";

interface WorldEventsScreenProps {
  view: WorldEventGuideView;
  onBack: () => void;
}

/**
 * The full World Events catalog as its own screen, readable without starting
 * a game. The in-game dialog reports on one table's deck; this is the
 * reference list of everything the house rules can produce.
 */
export function WorldEventsScreen({ onBack, view }: WorldEventsScreenProps) {
  const toneCounts = view.entries.reduce<Record<string, number>>(
    (counts, entry) => {
      counts[entry.tone] = (counts[entry.tone] ?? 0) + 1;
      return counts;
    },
    {},
  );

  return (
    <main className="app-shell events-layout">
      <header className="surface home-header">
        <div className="home-hero__topline">
          <p className="eyebrow">House rules</p>
          <Button variant="quiet" onClick={onBack}>
            Back
          </Button>
        </div>
        <h1>World Events</h1>
        <p className="lede">
          Every event in the built-in catalog. A game draws from the category
          packs chosen during setup, so a single table sees a subset of these.
        </p>
        <dl className="event-guide-summary">
          <div>
            <dt>Catalog</dt>
            <dd>{view.totalCount} events</dd>
          </div>
          <div>
            <dt>Boon</dt>
            <dd>{toneCounts["boon"] ?? 0}</dd>
          </div>
          <div>
            <dt>Mixed</dt>
            <dd>{toneCounts["mixed"] ?? 0}</dd>
          </div>
          <div>
            <dt>Setback</dt>
            <dd>{toneCounts["setback"] ?? 0}</dd>
          </div>
        </dl>
      </header>

      <section className="surface events-catalog">
        <WorldEventGuideList view={view} />
      </section>

      <footer className="home-footer">
        <span>World Events are a house rule, not part of official CATAN.</span>
        <span>Unofficial and not affiliated with CATAN GmbH.</span>
      </footer>
    </main>
  );
}
