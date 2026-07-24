import { useState } from "react";
import {
  Button,
  Dialog,
  DieFace,
  PlayerMarker,
  StatusBanner,
} from "../../components";
import { EVENT_DIE_ART } from "../../illustrationCatalog";
import { formatDuration } from "./time";

export interface ProgressEligiblePlayer {
  id: string;
  name: string;
  color: string;
  level: number;
  eligibleRange: string;
}

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

export interface RollResolutionView {
  currentPlayerName: string;
  nextPlayerName: string;
  currentTurnMs: number;
  totalGameMs: number;
  roll: {
    red: number;
    yellow: number;
    total: number;
    event: "barbarian" | "science" | "trade" | "politics";
    source: "balanced" | "alchemy";
  };
  progress: {
    discipline: "science" | "trade" | "politics";
    redValue: number;
    eligiblePlayers: ProgressEligiblePlayer[];
  } | null;
  production: {
    total: number;
    robberActivated: boolean;
  };
  barbarian: {
    position: number;
    trackLength: number;
  };
  attack: BarbarianAttackView | null;
}

export interface AttackProgressChoice {
  playerId: string;
  discipline: "science" | "trade" | "politics";
}

interface RollResolutionDialogProps {
  open: boolean;
  view: RollResolutionView;
  busy: boolean;
  onCorrectAttackPlayer: (playerId: string) => void;
  onPause: () => void;
  onContinue: (choices: AttackProgressChoice[]) => void;
  onQuickRoll: (choices: AttackProgressChoice[]) => void;
}

const eventNames = {
  barbarian: "Barbarian ship",
  politics: "Politics",
  science: "Science",
  trade: "Trade",
};

export function RollResolutionDialog({
  busy,
  onContinue,
  onCorrectAttackPlayer,
  onPause,
  onQuickRoll,
  open,
  view,
}: RollResolutionDialogProps) {
  const [progressChoices, setProgressChoices] = useState<
    Record<string, "science" | "trade" | "politics">
  >({});
  const attack = view.attack;
  const byId = new Map(
    attack?.players.map((player) => [player.id, player]) ?? [],
  );
  const uniqueDefender = attack?.uniqueDefenderId
    ? byId.get(attack.uniqueDefenderId)
    : undefined;
  const tiedDefenders =
    attack?.tiedDefenderIds.flatMap((id) => {
      const player = byId.get(id);
      return player ? [player] : [];
    }) ?? [];
  const pillagedPlayers =
    attack?.pillagedPlayerIds.flatMap((id) => {
      const player = byId.get(id);
      return player ? [player] : [];
    }) ?? [];
  const choicesReady = tiedDefenders.every(
    (player) => progressChoices[player.id] !== undefined,
  );
  const choices = tiedDefenders.map((player) => ({
    playerId: player.id,
    discipline: progressChoices[player.id] as "science" | "trade" | "politics",
  }));
  const isSeven = view.production.total === 7;

  return (
    <Dialog
      open={open}
      preventClose
      title={`Roll result: ${view.roll.total}`}
      description={`${view.currentPlayerName} rolled ${view.roll.red} + ${view.roll.yellow} with ${eventNames[view.roll.event]}.`}
      onClose={() => undefined}
    >
      <div className="roll-resolution">
        <section
          className="resolution-section resolution-section--dice"
          aria-labelledby="resolution-dice-heading"
        >
          <div className="resolution-heading">
            <div>
              <p className="eyebrow">Dice</p>
              <h3 id="resolution-dice-heading">
                {view.roll.red} + {view.roll.yellow} = {view.roll.total}
              </h3>
            </div>
            <span className="cycle-progress">
              {view.roll.source === "alchemy"
                ? "Chosen with Alchemy"
                : "Balanced draw"}
            </span>
          </div>
          <div className="game-clock-row resolution-clock-row">
            <span>
              Turn <strong>{formatDuration(view.currentTurnMs)}</strong>
            </span>
            <span>
              Game <strong>{formatDuration(view.totalGameMs)}</strong>
            </span>
          </div>
          <div className="resolution-dice">
            <DieFace
              kind="yellow"
              label="Yellow die"
              value={view.roll.yellow}
            />
            <span aria-hidden>+</span>
            <div className="event-dice-pair">
              <DieFace kind="red" label="Red die" value={view.roll.red} />
              <DieFace kind="event" label="Event die" value={view.roll.event} />
            </div>
            <strong className="dice-total">Production {view.roll.total}</strong>
          </div>
        </section>

        <section
          className="resolution-section resolution-section--event"
          aria-labelledby="event-heading"
        >
          <div className="resolution-event-visual" aria-hidden="true">
            <img src={EVENT_DIE_ART[view.roll.event]} alt="" decoding="async" />
          </div>
          <div className="resolution-heading">
            <div>
              <p className="eyebrow">Event die</p>
              <h3 id="event-heading">{eventNames[view.roll.event]}</h3>
            </div>
          </div>

          {attack ? (
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
                      disabled={busy}
                      onClick={() => {
                        onCorrectAttackPlayer(player.id);
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
                      {tiedDefenders.map((player) => player.name).join(", ")}{" "}
                      tied for the highest contribution. Each chooses one
                      progress deck; no Defender point is awarded.
                    </StatusBanner>
                    <div className="resolution-choice-grid">
                      {tiedDefenders.map((player) => (
                        <label key={player.id} className="field">
                          <span>{player.name}'s progress deck</span>
                          <select
                            value={progressChoices[player.id] ?? ""}
                            disabled={busy}
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
                  {pillagedPlayers.length === 1
                    ? "downgrades"
                    : "each downgrade"}{" "}
                  one ordinary city. Protected metropolises are not pillaged.
                </StatusBanner>
              )}

              {attack.firstAttack ? (
                <StatusBanner>
                  Completing this first attack activates the robber for later
                  rolls of 7.
                </StatusBanner>
              ) : null}
              <p className="fine-print">
                Continuing confirms the attack, resets the ship, and deactivates
                every active knight in the same undoable revision.
              </p>
            </div>
          ) : view.progress ? (
            <div className="form-stack">
              <p>
                Red die {view.progress.redValue} determines eligibility for{" "}
                {view.progress.discipline} progress cards.
              </p>
              {view.progress.eligiblePlayers.length === 0 ? (
                <StatusBanner>
                  No recorded player is eligible for this progress card.
                </StatusBanner>
              ) : (
                <ol className="eligibility-list">
                  {view.progress.eligiblePlayers.map((player) => (
                    <li key={player.id}>
                      <PlayerMarker color={player.color} label={player.name} />
                      <span>
                        Level {player.level} · eligible on{" "}
                        {player.eligibleRange}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="fine-print">
                Draw in current-player order. Cards remain private and are not
                tracked by the companion.
              </p>
            </div>
          ) : (
            <StatusBanner>
              The barbarian ship advances to {view.barbarian.position} of{" "}
              {view.barbarian.trackLength}.
            </StatusBanner>
          )}
        </section>

        <section
          className="resolution-section"
          aria-labelledby="production-heading"
        >
          <div className="resolution-heading">
            <div>
              <p className="eyebrow">Numbered dice</p>
              <h3 id="production-heading">
                {isSeven
                  ? "Resolve the 7"
                  : `Resolve production ${view.production.total}`}
              </h3>
            </div>
          </div>
          {isSeven ? (
            view.production.robberActivated ? (
              <StatusBanner tone="warning">
                Players above their hand limit discard, then move the robber and
                steal as normal. City walls increase the safe hand limit.
              </StatusBanner>
            ) : (
              <StatusBanner>
                Players above their hand limit still discard, but the robber is
                not active until the first barbarian attack is complete.
              </StatusBanner>
            )
          ) : (
            <StatusBanner tone="success">
              Distribute resources and commodities for total{" "}
              {view.production.total} at the physical board.
            </StatusBanner>
          )}
        </section>

        <footer className="roll-resolution__actions">
          <p className="fine-print">
            Use quick roll after {view.currentPlayerName} has completed the
            physical action phase. It ends the turn and rolls immediately for{" "}
            {view.nextPlayerName}.
          </p>
          <div className="button-row dialog-actions">
            <Button
              variant="quiet"
              size="large"
              disabled={busy}
              onClick={onPause}
            >
              Pause game
            </Button>
            <Button
              variant="secondary"
              size="large"
              disabled={busy || !choicesReady}
              onClick={() => {
                onContinue(choices);
              }}
            >
              Continue current turn
            </Button>
            <Button
              size="large"
              disabled={busy || !choicesReady}
              onClick={() => {
                onQuickRoll(choices);
              }}
            >
              {busy ? "Saving..." : `Next: ${view.nextPlayerName} & quick roll`}
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
