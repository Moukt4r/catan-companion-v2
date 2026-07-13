import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";

export interface ProgressEligiblePlayer {
  id: string;
  name: string;
  color: string;
  level: number;
  eligibleRange: string;
}

interface ProgressResolutionDialogProps {
  open: boolean;
  discipline: "science" | "trade" | "politics";
  redValue: number;
  eligiblePlayers: ProgressEligiblePlayer[];
  onAcknowledge: () => void;
}

export function ProgressResolutionDialog({
  discipline,
  eligiblePlayers,
  onAcknowledge,
  open,
  redValue,
}: ProgressResolutionDialogProps) {
  return (
    <Dialog
      open={open}
      preventClose
      title={`${discipline[0]?.toUpperCase()}${discipline.slice(1)} progress`}
      description={`The red die is ${redValue}. Draw in current-player order.`}
      onClose={() => undefined}
    >
      <div className="form-stack">
        {eligiblePlayers.length === 0 ? (
          <StatusBanner>
            No recorded player is eligible for this progress card.
          </StatusBanner>
        ) : (
          <ol className="eligibility-list">
            {eligiblePlayers.map((player) => (
              <li key={player.id}>
                <PlayerMarker color={player.color} label={player.name} />
                <span>
                  Level {player.level} · eligible on {player.eligibleRange}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="fine-print">
          Cards remain private and are not tracked by the companion. Immediately
          reveal any victory-point card as required by the physical game.
        </p>
        <Button size="large" block onClick={onAcknowledge}>
          Mark progress resolved
        </Button>
      </div>
    </Dialog>
  );
}
