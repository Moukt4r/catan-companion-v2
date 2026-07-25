import { useRef } from "react";
import type { BoardDesignId, BoardDesignSummary } from "../../../domain";
import { Button, StatusBanner } from "../../components";

interface BoardDesignLibraryScreenProps {
  designs: BoardDesignSummary[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onCreateClassic: () => void;
  onCreateBlank: () => void;
  onOpen: (id: BoardDesignId) => void;
  onDuplicate: (id: BoardDesignId) => void;
  onDelete: (id: BoardDesignId, revision: number) => void;
  onImport: (file: File) => void;
}

export function BoardDesignLibraryScreen({
  designs,
  error,
  loading,
  onBack,
  onCreateBlank,
  onCreateClassic,
  onDelete,
  onDuplicate,
  onImport,
  onOpen,
}: BoardDesignLibraryScreenProps) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <main className="app-shell board-library-layout">
      <header className="surface board-library-hero">
        <div>
          <p className="eyebrow">Build a custom island</p>
          <h1>Board Designer</h1>
          <p className="lede">
            Arrange terrain, sea, number tokens, and ports on a flexible hex
            grid. Designs stay on this device and work offline.
          </p>
        </div>
        <Button variant="quiet" onClick={onBack}>
          Back home
        </Button>
      </header>

      {error ? (
        <StatusBanner tone="danger" role="alert">
          {error}
        </StatusBanner>
      ) : null}

      <section
        className="surface board-library-actions"
        aria-labelledby="new-board-heading"
      >
        <div>
          <p className="card-kicker">New design</p>
          <h2 id="new-board-heading">Choose a starting inventory</h2>
          <p>
            Both options open the same editor. Every count can be changed before
            or after placing pieces.
          </p>
        </div>
        <div className="board-library-actions__buttons">
          <Button size="large" onClick={onCreateClassic}>
            Start default board
          </Button>
          <Button size="large" variant="secondary" onClick={onCreateBlank}>
            Start blank inventory
          </Button>
          <Button
            size="large"
            variant="quiet"
            onClick={() => {
              importRef.current?.click();
            }}
          >
            Import design
          </Button>
          <input
            ref={importRef}
            className="sr-only"
            aria-label="Import board design file"
            type="file"
            accept=".json,application/json,application/vnd.catan-table-companion.board+json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImport(file);
                event.target.value = "";
              }
            }}
          />
        </div>
      </section>

      <section
        className="surface board-library-list"
        aria-labelledby="saved-boards-heading"
      >
        <div>
          <p className="card-kicker">Local library</p>
          <h2 id="saved-boards-heading">Saved designs</h2>
        </div>
        {loading ? (
          <p aria-live="polite">Loading board designs...</p>
        ) : designs.length === 0 ? (
          <p>No saved designs yet.</p>
        ) : (
          <div className="board-design-cards">
            {designs.map((design) => (
              <article className="board-design-card" key={design.id}>
                <div>
                  <h3>{design.name}</h3>
                  <p>
                    {design.hexCount} placed hexes
                    {design.issueCount > 0
                      ? ` - ${design.issueCount} checks need review`
                      : " - no balance warnings"}
                  </p>
                  <small>
                    Saved {new Date(design.updatedAt).toLocaleString()}
                  </small>
                </div>
                <div className="button-row">
                  <Button
                    onClick={() => {
                      onOpen(design.id);
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onDuplicate(design.id);
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      onDelete(design.id, design.revision);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
