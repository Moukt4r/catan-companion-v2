import { Button, Dialog, StatusBanner } from "../../components";

interface SaveRecoveryDialogProps {
  open: boolean;
  message: string;
  busy: boolean;
  onRetry: () => void;
  onExport: () => void;
  onRevert: () => void;
}

export function SaveRecoveryDialog({
  busy,
  message,
  onExport,
  onRetry,
  onRevert,
  open,
}: SaveRecoveryDialogProps) {
  return (
    <Dialog
      open={open}
      title="Save not confirmed"
      description="Resolve this action before continuing the game."
      preventClose
      onClose={() => undefined}
    >
      <div className="form-stack">
        <StatusBanner tone="danger" role="alert">
          {message}
        </StatusBanner>
        <p>
          Retry is safe even if the browser committed the action before
          reporting the failure.
        </p>
        <div className="button-row">
          <Button disabled={busy} onClick={onRetry}>
            Retry save
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onExport}>
            Export emergency backup
          </Button>
          <Button variant="danger" disabled={busy} onClick={onRevert}>
            Revert unsaved action
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
