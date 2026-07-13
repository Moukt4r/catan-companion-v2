import { useMemo, useState } from "react";
import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";

interface MetropolisCorrectionPlayer {
  id: string;
  name: string;
  color: string;
  improvements: {
    science: number;
    trade: number;
    politics: number;
  };
}

interface MetropolisCorrectionDialogProps {
  open: boolean;
  players: MetropolisCorrectionPlayer[];
  onPropose: (
    discipline: "science" | "trade" | "politics",
    holderId: string | null,
    status: "temporary" | "permanent" | null,
  ) => void;
  onClose: () => void;
}

export function MetropolisCorrectionDialog({
  onClose,
  onPropose,
  open,
  players,
}: MetropolisCorrectionDialogProps) {
  const [discipline, setDiscipline] = useState<
    "science" | "trade" | "politics"
  >("science");
  const [holderId, setHolderId] = useState("");
  const holder = useMemo(
    () => players.find((player) => player.id === holderId) ?? null,
    [holderId, players],
  );
  const level = holder?.improvements[discipline] ?? 0;
  const [status, setStatus] = useState<"temporary" | "permanent">("temporary");
  const effectiveStatus = holderId === "" ? null : status;
  const valid =
    holderId === "" ||
    (effectiveStatus === "temporary" ? level >= 4 : level >= 5);

  return (
    <Dialog
      open={open}
      title="Correct metropolis control"
      description="Use this only to make the companion match the physical city-improvement board."
      onClose={onClose}
    >
      <div className="form-stack">
        <label className="field">
          <span>Discipline</span>
          <select
            value={discipline}
            onChange={(event) => {
              setDiscipline(event.target.value as typeof discipline);
            }}
          >
            <option value="science">Science</option>
            <option value="trade">Trade</option>
            <option value="politics">Politics</option>
          </select>
        </label>
        <label className="field">
          <span>Recorded holder</span>
          <select
            value={holderId}
            onChange={(event) => {
              setHolderId(event.target.value);
            }}
          >
            <option value="">No holder</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} · level {player.improvements[discipline]}
              </option>
            ))}
          </select>
        </label>
        {holder ? (
          <PlayerMarker color={holder.color} label={holder.name} />
        ) : null}
        {holder ? (
          <label className="field">
            <span>Control status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
              }}
            >
              <option value="temporary">Temporary (requires level 4+)</option>
              <option value="permanent">Permanent (requires level 5)</option>
            </select>
          </label>
        ) : null}
        {!valid ? (
          <StatusBanner tone="danger" role="alert">
            {holder?.name} does not have the recorded improvement level required
            for this status.
          </StatusBanner>
        ) : (
          <StatusBanner tone="warning">
            The correction changes ordinary-city counts and the two public
            metropolis points in one undoable revision.
          </StatusBanner>
        )}
        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onPropose(discipline, holderId || null, effectiveStatus);
            }}
          >
            Review correction
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
