import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";
import { formatDuration } from "./time";

interface PauseGameDialogProps {
  open: boolean;
  currentPlayerName: string;
  currentPlayerColor: string;
  currentTurnMs: number;
  totalGameMs: number;
  canResume: boolean;
  busy: boolean;
  onResume: () => void;
}

export function PauseGameDialog({
  busy,
  canResume,
  currentPlayerColor,
  currentPlayerName,
  currentTurnMs,
  onResume,
  open,
  totalGameMs,
}: PauseGameDialogProps) {
  return (
    <Dialog
      open={open}
      preventClose
      title="Game paused"
      description="All active-play timers are stopped and every other game control is disabled."
      onClose={() => undefined}
    >
      <div className="pause-game">
        <PlayerMarker
          color={currentPlayerColor}
          label={`${currentPlayerName}'s paused turn`}
        />
        <dl className="pause-clock-grid">
          <div>
            <dt>Current turn</dt>
            <dd>{formatDuration(currentTurnMs)}</dd>
          </div>
          <div>
            <dt>Total game</dt>
            <dd>{formatDuration(totalGameMs)}</dd>
          </div>
        </dl>
        {!canResume ? (
          <StatusBanner tone="warning">
            Resume the game from the controlling tab.
          </StatusBanner>
        ) : null}
        <Button
          size="large"
          block
          disabled={!canResume || busy}
          onClick={onResume}
        >
          {busy ? "Resuming..." : "Resume game"}
        </Button>
      </div>
    </Dialog>
  );
}
