import { useRef } from "react";
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
  onNewGame,
  onResume,
  onSettings,
  onViewArchive,
}: HomeScreenProps) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <main className="app-shell home-layout">
      <header className="home-header">
        <div>
          <p className="eyebrow">One shared screen. No account required.</p>
          <h1>Catan Table Companion</h1>
          <p className="lede">
            Balanced dice, Cities &amp; Knights bookkeeping, and original table
            events that keep the physical game moving.
          </p>
        </div>
        <Button variant="quiet" onClick={onSettings}>
          Device settings
        </Button>
      </header>

      {error ? (
        <StatusBanner tone="danger" role="alert">
          {error}
        </StatusBanner>
      ) : null}

      {loading ? (
        <section className="surface home-card" aria-live="polite">
          <h2>Loading saved games</h2>
          <p>Your game stays on this device and will be ready in a moment.</p>
        </section>
      ) : activeGame ? (
        <section
          className="surface home-card home-card--active"
          aria-labelledby="resume-heading"
        >
          <p className="eyebrow">Current game</p>
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
          <p className="eyebrow">Ready offline after first load</p>
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
        <button
          type="button"
          className="home-action"
          onClick={() => {
            importRef.current?.click();
          }}
        >
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
