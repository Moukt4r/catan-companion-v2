import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";

export interface MetropolisProposalView {
  discipline: "science" | "trade" | "politics";
  nextHolder: {
    id: string;
    name: string;
    color: string;
  } | null;
  previousHolder: {
    id: string;
    name: string;
    color: string;
  } | null;
  status: "temporary" | "permanent" | null;
}

interface MetropolisDialogProps {
  proposal: MetropolisProposalView;
  onConfirm: () => void;
  onReject: () => void;
}

export function MetropolisDialog({
  onConfirm,
  onReject,
  proposal,
}: MetropolisDialogProps) {
  return (
    <Dialog
      open
      preventClose
      title={`${proposal.discipline[0]?.toUpperCase()}${proposal.discipline.slice(1)} metropolis`}
      description="Confirm the physical metropolis placement before changing public score and city counts."
      onClose={() => undefined}
    >
      <div className="form-stack">
        {proposal.nextHolder ? (
          <PlayerMarker
            color={proposal.nextHolder.color}
            label={`${proposal.nextHolder.name} gains ${proposal.status} control`}
          />
        ) : (
          <StatusBanner>
            The recorded {proposal.discipline} metropolis will be removed.
          </StatusBanner>
        )}
        {proposal.previousHolder ? (
          <StatusBanner tone="warning">
            <PlayerMarker
              color={proposal.previousHolder.color}
              label={proposal.previousHolder.name}
            />{" "}
            loses temporary control and two public victory points.
          </StatusBanner>
        ) : null}
        {proposal.nextHolder ? (
          <StatusBanner>
            Confirmation converts one of {proposal.nextHolder.name}'s ordinary
            cities into a metropolis and adds two public victory points.
          </StatusBanner>
        ) : null}
        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onReject}>
            The physical board differs
          </Button>
          <Button size="large" onClick={onConfirm}>
            Confirm metropolis
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
