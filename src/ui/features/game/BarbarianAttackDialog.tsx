import { useState } from "react";
import { Button, Dialog, PlayerMarker, StatusBanner } from "../../components";

export interface AttackPlayerView {
  id: string;
  name: string;
  color: string;
  ordinaryCities: number;
  metropolises: number;
  activeKnights: string;
  activeStrength: number;
}

export interface BarbarianAttackView {
  proposalId: string;
  barbarianStrength: number;
  defenderStrength: number;
  outcome: "defenders-win" | "barbarians-win";
  players: AttackPlayerView[];
  uniqueDefenderId: string | null;
  tiedDefenderIds: string[];
  pillagedPlayerIds: string[];
  firstAttack: boolean;
}

interface BarbarianAttackDialogProps {
  attack: BarbarianAttackView;
  onEditPlayer: (playerId: string) => void;
  onConfirm: (
    choices: Array<{
      playerId: string;
      discipline: "science" | "trade" | "politics";
    }>,
  ) => void;
  onCancelToCorrect: () => void;
}

export function BarbarianAttackDialog({
  attack,
  onCancelToCorrect,
  onConfirm,
  onEditPlayer,
}: BarbarianAttackDialogProps) {
  const [progressChoices, setProgressChoices] = useState<
    Record<string, "science" | "trade" | "politics">
  >({});
  const byId = new Map(attack.players.map((player) => [player.id, player]));
  const uniqueDefender = attack.uniqueDefenderId
    ? byId.get(attack.uniqueDefenderId)
    : undefined;
  const tiedDefenders = attack.tiedDefenderIds.flatMap((id) => {
    const player = byId.get(id);
    return player ? [player] : [];
  });
  const pillagedPlayers = attack.pillagedPlayerIds.flatMap((id) => {
    const player = byId.get(id);
    return player ? [player] : [];
  });

  return (
    <Dialog
      open
      preventClose
      title="Barbarians attack"
      description="Verify the public board state before committing the result."
      onClose={() => undefined}
    >
      <div className="form-stack">
        <dl className="attack-comparison">
          <div>
            <dt>Barbarian strength</dt>
            <dd>{attack.barbarianStrength}</dd>
          </div>
          <span aria-hidden>
            {attack.outcome === "defenders-win" ? "<=" : ">"}
          </span>
          <div>
            <dt>Active defense</dt>
            <dd>{attack.defenderStrength}</dd>
          </div>
        </dl>

        <div
          className="attack-player-table"
          role="table"
          aria-label="Attack contributions"
        >
          {attack.players.map((player) => (
            <div key={player.id} role="row" className="attack-player-row">
              <div role="cell">
                <PlayerMarker color={player.color} label={player.name} />
              </div>
              <span role="cell">
                {player.ordinaryCities} cities · {player.metropolises}{" "}
                metropolises
              </span>
              <span role="cell">
                {player.activeKnights || "No active knights"} · strength{" "}
                {player.activeStrength}
              </span>
              <Button
                variant="quiet"
                size="small"
                onClick={() => {
                  onEditPlayer(player.id);
                }}
              >
                Correct
              </Button>
            </div>
          ))}
        </div>

        {attack.outcome === "defenders-win" ? (
          uniqueDefender ? (
            <StatusBanner tone="success">
              <PlayerMarker
                color={uniqueDefender.color}
                label={uniqueDefender.name}
              />{" "}
              receives one Defender victory point.
            </StatusBanner>
          ) : (
            <>
              <StatusBanner tone="success">
                {tiedDefenders.map((player) => player.name).join(", ")} tied for
                the highest contribution. Each chooses one progress deck; no
                Defender point is awarded.
              </StatusBanner>
              <div className="form-stack">
                {tiedDefenders.map((player) => (
                  <label key={player.id} className="field">
                    <span>{player.name}'s progress deck</span>
                    <select
                      value={progressChoices[player.id] ?? ""}
                      onChange={(event) => {
                        setProgressChoices((current) => ({
                          ...current,
                          [player.id]: event.target.value as
                            "science" | "trade" | "politics",
                        }));
                      }}
                    >
                      <option value="">Choose a deck</option>
                      <option value="science">Science</option>
                      <option value="trade">Trade</option>
                      <option value="politics">Politics</option>
                    </select>
                  </label>
                ))}
              </div>
            </>
          )
        ) : (
          <StatusBanner tone="danger">
            {pillagedPlayers.map((player) => player.name).join(", ")}{" "}
            {pillagedPlayers.length === 1 ? "downgrades" : "each downgrade"} one
            ordinary city. Protected metropolises are not pillaged.
          </StatusBanner>
        )}

        {attack.firstAttack ? (
          <StatusBanner>
            Completing this first attack activates the robber for later rolls of
            7.
          </StatusBanner>
        ) : null}

        <p className="fine-print">
          Confirmation resets the ship, deactivates every active knight, and
          records all score and city changes in one undoable revision.
        </p>

        <div className="button-row dialog-actions">
          <Button variant="quiet" onClick={onCancelToCorrect}>
            Return to board state
          </Button>
          <Button
            size="large"
            disabled={
              tiedDefenders.length > 0 &&
              tiedDefenders.some(
                (player) => progressChoices[player.id] === undefined,
              )
            }
            onClick={() => {
              onConfirm(
                tiedDefenders.map((player) => ({
                  playerId: player.id,
                  discipline: progressChoices[player.id] as
                    "science" | "trade" | "politics",
                })),
              );
            }}
          >
            Confirm attack outcome
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
