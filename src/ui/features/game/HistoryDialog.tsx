import { Button, Dialog } from "../../components";

export interface HistoryEntryView {
  id: string;
  sequence: number;
  createdAt: string;
  playerName: string | null;
  title: string;
  detail: string;
  houseRule: boolean;
  active: boolean;
}

interface HistoryDialogProps {
  open: boolean;
  entries: HistoryEntryView[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}

export function HistoryDialog({
  canRedo,
  canUndo,
  entries,
  onClose,
  onRedo,
  onUndo,
  open,
}: HistoryDialogProps) {
  return (
    <Dialog
      open={open}
      title="Game history"
      description="Every accepted change is stored as a complete local revision."
      onClose={onClose}
    >
      <div className="history-toolbar">
        <Button variant="secondary" disabled={!canUndo} onClick={onUndo}>
          Undo latest
        </Button>
        <Button variant="secondary" disabled={!canRedo} onClick={onRedo}>
          Redo
        </Button>
      </div>
      {entries.length === 0 ? (
        <p>No actions have been recorded yet.</p>
      ) : (
        <ol className="history-list">
          {entries
            .slice()
            .reverse()
            .map((entry) => (
              <li
                key={entry.id}
                className={entry.active ? "history-entry--active" : ""}
              >
                <div className="history-entry__meta">
                  <span>Revision {entry.sequence}</span>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </time>
                </div>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
                <div className="history-entry__labels">
                  {entry.playerName ? <span>{entry.playerName}</span> : null}
                  {entry.houseRule ? (
                    <span className="rule-label rule-label--house">
                      House rule
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
        </ol>
      )}
    </Dialog>
  );
}
