import { Button } from "./Button";

interface NumberStepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  compact?: boolean;
}

export function NumberStepper({
  compact = false,
  label,
  max = Number.MAX_SAFE_INTEGER,
  min = 0,
  onChange,
  value,
}: NumberStepperProps) {
  return (
    <div className={compact ? "stepper stepper--compact" : "stepper"}>
      <span className="stepper__label">{label}</span>
      <div className="stepper__controls">
        <Button
          variant="secondary"
          size="small"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => {
            onChange(Math.max(min, value - 1));
          }}
        >
          -
        </Button>
        <input
          className="stepper__input"
          aria-label={label}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(Math.min(max, Math.max(min, Math.trunc(next))));
            }
          }}
        />
        <Button
          variant="secondary"
          size="small"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => {
            onChange(Math.min(max, value + 1));
          }}
        >
          +
        </Button>
      </div>
    </div>
  );
}
