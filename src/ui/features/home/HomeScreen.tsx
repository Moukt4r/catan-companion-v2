import { useRef } from "react";
import frontierIllustration from "../../../assets/illustrations/frontier-tabletop.webp";
import { Button, PlayerMarker, StatusBanner } from "../../components";

export interface HomeGameSummary {
  id: string;
  title: string;
  currentPlayerName: string;
  currentPlayerColor: string;
  round: number;
  updatedAt: string;
  players: string[];
}

interface HomeScreenProps {
  activeGame: HomeGameSummary | null;
  archivedCount: number;
  loading: boolean;
  error: string | null;
  onResume: () => void;
  onNewGame: () => void;
  onBoardDesigner: () => void;
  onImport: (file: File) => void;
  onSettings: () => void;
  onViewArchive: () => void;
}

export function HomeScreen({
  activeGame,
  archivedCount,
  error,
  loading,
  onImport,
  onBoardDesigner,
  onNewGame,
  onResume,
  onSettings,
  onViewArchive,
}: HomeScreenProps) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <main className="app-shell home-layout">
      <header className="surface home-header home-hero">
        <div className="home-hero__copy">
          <div className="home-hero__topline">
            <p className="eyebrow">Gather the table</p>
            <Button variant="quiet" onClick={onSettings}>
              Device settings
            </Button>
          </div>
          <h1>Catan Table Companion</h1>
          <p className="lede">
            A warm, shared command center for balanced rolls, Cities &amp;
            Knights bookkeeping, and original events around the physical board.
          </p>
          <ul className="home-hero__features" aria-label="Companion highlights">
            <li>Offline-first</li>
            <li>Saved every action</li>
            <li>No account</li>
          </ul>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <img src={frontierIllustration} alt="" />
          <div className="home-hero__legend">
            <span>Grain</span>
            <span>Timber</span>
            <span>Wool</span>
            <span>Clay</span>
            <span>Ore</span>
          </div>
        </div>
      </header>

      {error ? (
        <StatusBanner tone="danger" role="alert">
          {error}
        </StatusBanner>
      ) : null}

      {loading ? (
        <section className="surface home-card" aria-live="polite">
          <p className="card-kicker">Local ledger</p>
          <h2>Loading saved games</h2>
          <p>Your game stays on this device and will be ready in a moment.</p>
        </section>
      ) : activeGame ? (
        <section
          className="surface home-card home-card--active"
          aria-labelledby="resume-heading"
        >
          <p className="card-kicker">Current game</p>
          <h2 id="resume-heading">{activeGame.title}</h2>
          <PlayerMarker
            color={activeGame.currentPlayerColor}
            label={`${activeGame.currentPlayerName}'s turn`}
          />
          <dl className="definition-grid">
            <div>
              <dt>Round</dt>
              <dd>{activeGame.round}</dd>
            </div>
            <div>
              <dt>Players</dt>
              <dd>{activeGame.players.join(", ")}</dd>
            </div>
            <div>
              <dt>Last saved</dt>
              <dd>{new Date(activeGame.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
          <div className="button-row">
            <Button size="large" onClick={onResume}>
              Resume game
            </Button>
            <Button size="large" variant="secondary" onClick={onNewGame}>
              Start another game
            </Button>
          </div>
        </section>
      ) : (
        <section
          className="surface home-card home-card--active"
          aria-labelledby="start-heading"
        >
          <p className="card-kicker">Ready offline after first load</p>
          <h2 id="start-heading">Start a new table</h2>
          <p>
            Set up three or four players, review the house rules, and the game
            is saved after every accepted action.
          </p>
          <Button size="large" onClick={onNewGame}>
            Start new game
          </Button>
        </section>
      )}

      <section className="home-actions" aria-label="More actions">
        <button type="button" className="home-action" onClick={onBoardDesigner}>
          <span className="home-action__index" aria-hidden="true">
            01
          </span>
          <strong>Board designer</strong>
          <span>Build custom terrain, number, sea, and port layouts.</span>
        </button>
        <button
          type="button"
          className="home-action"
          onClick={() => {
            importRef.current?.click();
          }}
        >
          <span className="home-action__index" aria-hidden="true">
            02
          </span>
          <strong>Import backup</strong>
          <span>Restore a validated JSON game export.</span>
        </button>
        <input
          ref={importRef}
          className="sr-only"
          aria-label="Import game backup file"
          type="file"
          accept=".json,application/json,application/vnd.catan-table-companion.game+json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImport(file);
              event.target.value = "";
            }
          }}
        />
        <button type="button" className="home-action" onClick={onViewArchive}>
          <span className="home-action__index" aria-hidden="true">
            03
          </span>
          <strong>Saved games</strong>
          <span>
            {archivedCount} archived or completed games on this device.
          </span>
        </button>
      </section>

      <footer className="home-footer">
        <span>Balanced rolls and thematic events are house rules.</span>
        <span>Unofficial and not affiliated with CATAN GmbH.</span>
      </footer>
    </main>
  );
}
