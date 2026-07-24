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
  ordinaryCities: number;
  activeKnights: {
    basic: number;
    strong: number;
    mighty: number;
  };
  improvements: {
    science: ImprovementValue;
    trade: ImprovementValue;
    politics: ImprovementValue;
  };
  metropolisDisciplines: string[];
}

export interface PlayerEditorPatch {
  ordinaryCities: number;
  activeKnights: PlayerEditorValue["activeKnights"];
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
  const [ordinaryCities, setOrdinaryCities] = useState(player.ordinaryCities);
  const [activeKnights, setActiveKnights] = useState(player.activeKnights);
  const [improvements, setImprovements] = useState(player.improvements);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [scoreNote, setScoreNote] = useState("");

  const updateKnight = (
    kind: keyof PlayerEditorValue["activeKnights"],
    value: number,
  ) => {
    setActiveKnights((current) => ({
      ...current,
      [kind]: value,
    }));
  };

  const updateImprovement = (
    discipline: keyof PlayerEditorValue["improvements"],
    value: ImprovementValue,
  ) => {
    setImprovements((current) => ({
      ...current,
      [discipline]: value,
    }));
  };

  const activeStrength =
    activeKnights.basic + activeKnights.strong * 2 + activeKnights.mighty * 3;

  return (
    <Dialog
      open
      title={`Edit ${player.name}`}
      description="Adjust points first. Cities and Knights details are available when needed, and every saved change appears in history."
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
          <summary>Advanced Cities &amp; Knights state</summary>
          <div className="editor-advanced__content">
            <section
              className="editor-section"
              aria-labelledby="cities-editor-heading"
            >
              <h3 id="cities-editor-heading">Cities</h3>
              <NumberStepper
                compact
                label="Ordinary cities"
                value={ordinaryCities}
                min={0}
                max={4}
                onChange={setOrdinaryCities}
              />
              <p className="fine-print">
                Metropolises are tracked by discipline and are not included in
                this ordinary-city count. Held:{" "}
                {player.metropolisDisciplines.join(", ") || "none"}.
              </p>
            </section>

            <section
              className="editor-section"
              aria-labelledby="knights-editor-heading"
            >
              <div className="section-heading-row">
                <h3 id="knights-editor-heading">Active knights</h3>
                <strong>Strength {activeStrength}</strong>
              </div>
              <NumberStepper
                compact
                label="Basic"
                value={activeKnights.basic}
                min={0}
                max={2}
                onChange={(value) => {
                  updateKnight("basic", value);
                }}
              />
              <NumberStepper
                compact
                label="Strong"
                value={activeKnights.strong}
                min={0}
                max={2}
                onChange={(value) => {
                  updateKnight("strong", value);
                }}
              />
              <NumberStepper
                compact
                label="Mighty"
                value={activeKnights.mighty}
                min={0}
                max={2}
                onChange={(value) => {
                  updateKnight("mighty", value);
                }}
              />
            </section>

            <section
              className="editor-section"
              aria-labelledby="improvements-editor-heading"
            >
              <h3 id="improvements-editor-heading">City improvements</h3>
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
                ordinaryCities,
                activeKnights,
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
