import { useState } from "react";
import { Button, Dialog, NumberStepper, StatusBanner } from "../../components";

interface AlchemyDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (red: number, yellow: number) => void;
}

export function AlchemyDialog({
  onCancel,
  onConfirm,
  open,
}: AlchemyDialogProps) {
  const [red, setRed] = useState(3);
  const [yellow, setYellow] = useState(4);

  return (
    <Dialog
      open={open}
      title="Use Alchemy"
      description="Choose both numbered dice before the event die is drawn."
      onClose={onCancel}
    >
      <div className="form-stack">
        <StatusBanner tone="warning">
          House-deck behavior: this chosen pair does not consume the next
          balanced numbered outcome. The event die still advances normally.
        </StatusBanner>
        <div className="alchemy-grid">
          <NumberStepper
            label="Red die"
            value={red}
            min={1}
            max={6}
            onChange={setRed}
          />
          <NumberStepper
            label="White die"
            value={yellow}
            min={1}
            max={6}
            onChange={setYellow}
          />
        </div>
        <p className="alchemy-total">
          Production total: <strong>{red + yellow}</strong>
        </p>
        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(red, yellow);
            }}
          >
            Roll event die
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
