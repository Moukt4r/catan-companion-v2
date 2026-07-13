import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";

interface WinnerDialogProps {
  open: boolean;
  player: {
    id: string;
    name: string;
    color: string;
    victoryPoints: number;
  } | null;
  target: number;
  onConfirm: () => void;
  onClose: () => void;
}

export function WinnerDialog({
  onClose,
  onConfirm,
  open,
  player,
  target,
}: WinnerDialogProps) {
  if (!player) {
    return null;
  }

  return (
    <Dialog
      open={open}
      title="Confirm the winner"
      description="Hidden victory points and physical-board state remain the table's authority."
      onClose={onClose}
    >
      <div className="form-stack">
        <PlayerMarker color={player.color} label={player.name} />
        <StatusBanner tone="success">
          The companion records {player.victoryPoints} public points against a
          target of {target}.
        </StatusBanner>
        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onClose}>
            Keep playing
          </Button>
          <Button size="large" onClick={onConfirm}>
            Confirm {player.name} won
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
