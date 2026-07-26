import { useState } from "react";
import {
  Button,
  Dialog,
  NumberStepper,
  PlayerMarker,
  StatusBanner,
} from "../../components";

type ImprovementValue = 0 | 1 | 2 | 3 | 4 | 5;

export interface PlayerEditorValue {
  id: string;
  name: string;
  color: string;
  victoryPoints: number;
  improvements: {
    science: ImprovementValue;
    trade: ImprovementValue;
    politics: ImprovementValue;
  };
  metropolisDisciplines: string[];
}

export interface PlayerEditorPatch {
  improvements: PlayerEditorValue["improvements"];
  scoreDelta: number;
  scoreNote: string;
}

interface PlayerEditorDialogProps {
  player: PlayerEditorValue;
  onSave: (patch: PlayerEditorPatch) => void;
  onClose: () => void;
}

export function PlayerEditorDialog({
  onClose,
  onSave,
  player,
}: PlayerEditorDialogProps) {
  const [improvements, setImprovements] = useState(player.improvements);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [scoreNote, setScoreNote] = useState("");

  const updateImprovement = (
    discipline: keyof PlayerEditorValue["improvements"],
    value: ImprovementValue,
  ) => {
    setImprovements((current) => ({
      ...current,
      [discipline]: value,
    }));
  };

  return (
    <Dialog
      open
      title={`Edit ${player.name}`}
      description="Adjust points and improvement levels. Cities, walls and knights live on the physical board."
      onClose={onClose}
    >
      <div className="form-stack">
        <PlayerMarker
          color={player.color}
          label={`${player.victoryPoints} public victory points`}
        />

        <section
          className="editor-section editor-section--score"
          aria-labelledby="score-editor-heading"
        >
          <h3 id="score-editor-heading">Public points</h3>
          <NumberStepper
            compact
            label="Point change"
            value={scoreDelta}
            min={-10}
            max={10}
            onChange={setScoreDelta}
          />
          <label className="field">
            <span>Reason</span>
            <input
              value={scoreNote}
              maxLength={80}
              placeholder="Longest road, revealed VP, correction..."
              onChange={(event) => {
                setScoreNote(event.target.value);
              }}
            />
          </label>
        </section>

        <details className="editor-advanced">
          <summary>City improvements</summary>
          <div className="editor-advanced__content">
            <section
              className="editor-section"
              aria-labelledby="improvements-editor-heading"
            >
              <h3 id="improvements-editor-heading">City improvements</h3>
              <p className="fine-print">
                Improvement levels decide progress-card eligibility. Held
                metropolises:{" "}
                {player.metropolisDisciplines.join(", ") || "none"}.
              </p>
              {(["science", "trade", "politics"] as const).map((discipline) => (
                <NumberStepper
                  key={discipline}
                  compact
                  label={discipline[0]?.toUpperCase() + discipline.slice(1)}
                  value={improvements[discipline]}
                  min={0}
                  max={5}
                  onChange={(value) => {
                    updateImprovement(discipline, value as ImprovementValue);
                  }}
                />
              ))}
              <StatusBanner>
                Crossing level 4 or 5 may open a metropolis confirmation after
                this edit.
              </StatusBanner>
            </section>
          </div>
        </details>

        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({
                improvements,
                scoreDelta,
                scoreNote: scoreNote.trim(),
              });
            }}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
