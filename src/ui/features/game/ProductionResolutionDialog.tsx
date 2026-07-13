import { Button, Dialog, StatusBanner } from "../../components";

interface ProductionResolutionDialogProps {
  open: boolean;
  total: number;
  robberActivated: boolean;
  onAcknowledge: () => void;
}

export function ProductionResolutionDialog({
  onAcknowledge,
  open,
  robberActivated,
  total,
}: ProductionResolutionDialogProps) {
  const isSeven = total === 7;

  return (
    <Dialog
      open={open}
      preventClose
      title={isSeven ? "Resolve the 7" : `Resolve production ${total}`}
      description={
        isSeven
          ? "Complete discards and robber steps at the physical board."
          : "Distribute resources and commodities at the physical board."
      }
      onClose={() => undefined}
    >
      <div className="form-stack">
        {isSeven ? (
          robberActivated ? (
            <StatusBanner tone="warning">
              Players above their hand limit discard, then move the robber and
              steal as normal. City walls increase the safe hand limit on the
              physical board.
            </StatusBanner>
          ) : (
            <StatusBanner>
              Players above their hand limit still discard, but the robber is
              not active until the first barbarian attack has completed.
            </StatusBanner>
          )
        ) : (
          <StatusBanner tone="success">
            Resolve hex production for total {total}. Remember that Cities &amp;
            Knights cities may produce commodities.
          </StatusBanner>
        )}
        <Button size="large" block onClick={onAcknowledge}>
          Mark {isSeven ? "7" : "production"} resolved
        </Button>
      </div>
    </Dialog>
  );
}
