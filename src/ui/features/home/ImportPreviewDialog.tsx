import { Button, Dialog, StatusBanner } from "../../components";

export interface ImportPreview {
  title: string;
  players: string[];
  turns: number;
  updatedAt: string;
  sourceVersion: string;
  status: string;
}

interface ImportPreviewDialogProps {
  open: boolean;
  preview: ImportPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImportPreviewDialog({
  onCancel,
  onConfirm,
  open,
  preview,
}: ImportPreviewDialogProps) {
  if (!preview) {
    return null;
  }

  return (
    <Dialog
      open={open}
      title="Import game backup"
      description="The backup has passed schema and integrity checks."
      onClose={onCancel}
    >
      <div className="form-stack">
        <StatusBanner>
          The imported game receives a new local ID and does not overwrite an
          existing game.
        </StatusBanner>
        <dl className="definition-grid">
          <div>
            <dt>Game</dt>
            <dd>{preview.title}</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{preview.players.join(", ")}</dd>
          </div>
          <div>
            <dt>Turns</dt>
            <dd>{preview.turns}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{new Date(preview.updatedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Source version</dt>
            <dd>{preview.sourceVersion}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{preview.status}</dd>
          </div>
        </dl>
        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Import as new local game</Button>
        </div>
      </div>
    </Dialog>
  );
}
