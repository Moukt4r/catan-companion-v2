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
}

export interface BarbarianAttackView {
  proposalId: string;
  players: AttackPlayerView[];
  firstAttack: boolean;
}

export type ManualAttackResolution =
  | {
      type: "defenders-win";
      reward:
        | { type: "defender-point"; playerId: string }
        | {
            type: "progress-choice";
            playerIds: string[];
            choices: AttackProgressChoice[];
          };
    }
  | { type: "barbarians-win"; pillagedPlayerIds: string[] };

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
  onPause: () => void;
  onContinue: (resolution: ManualAttackResolution | null) => void;
  onQuickRoll: (resolution: ManualAttackResolution | null) => void;
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
  onPause,
  onQuickRoll,
  open,
  view,
}: RollResolutionDialogProps) {
  const [outcomeType, setOutcomeType] = useState<
    "defenders-win" | "barbarians-win" | null
  >(null);
  const [rewardType, setRewardType] = useState<
    "defender-point" | "progress-choice" | null
  >(null);
  const [soleDefenderId, setSoleDefenderId] = useState<string>("");
  const [tiedDefenderIds, setTiedDefenderIds] = useState<Set<string>>(
    new Set(),
  );
  const [progressChoices, setProgressChoices] = useState<
    Record<string, "science" | "trade" | "politics">
  >({});
  const [pillagedPlayerIds, setPillagedPlayerIds] = useState<Set<string>>(
    new Set(),
  );

  const attack = view.attack;
  const players = attack?.players ?? [];
  const vulnerablePlayers = players.filter(
    (player) => player.ordinaryCities > 0,
  );

  function buildResolution(): ManualAttackResolution | null {
    if (!attack || !outcomeType) return null;
    if (outcomeType === "defenders-win") {
      if (rewardType === "defender-point") {
        if (!soleDefenderId) return null;
        return {
          type: "defenders-win",
          reward: { type: "defender-point", playerId: soleDefenderId },
        };
      }
      if (rewardType === "progress-choice") {
        const ids = [...tiedDefenderIds];
        if (ids.length < 2) return null;
        const allChosen = ids.every((id) => progressChoices[id] !== undefined);
        if (!allChosen) return null;
        return {
          type: "defenders-win",
          reward: {
            type: "progress-choice",
            playerIds: ids,
            choices: ids.map((id) => ({
              playerId: id,
              discipline: progressChoices[id] as
                "science" | "trade" | "politics",
            })),
          },
        };
      }
      return null;
    }
    // barbarians-win: pillagedPlayerIds can be empty if no vulnerable city
    return {
      type: "barbarians-win",
      pillagedPlayerIds: [...pillagedPlayerIds],
    };
  }

  const resolution = buildResolution();
  const choicesReady = attack ? resolution !== null : true;
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
              <h3 id="resolution-dice-heading">Production {view.roll.total}</h3>
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
            <h3 id="event-heading">{eventNames[view.roll.event]}</h3>
          </div>

          {attack ? (
            <div className="form-stack">
              <StatusBanner tone="info">
                The barbarian ship reached the end of the track. Resolve the
                attack on the physical board by comparing total active knight
                strength to the barbarian strength (number of cities +
                metropolises).
              </StatusBanner>

              <fieldset className="attack-outcome-fieldset">
                <legend>Who won the attack?</legend>
                <p className="fine-print">
                  Record the result from the physical board below.
                </p>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="attack-outcome"
                      value="defenders-win"
                      checked={outcomeType === "defenders-win"}
                      disabled={busy}
                      onChange={() => {
                        setOutcomeType("defenders-win");
                        setRewardType(null);
                        setSoleDefenderId("");
                        setTiedDefenderIds(new Set());
                        setProgressChoices({});
                        setPillagedPlayerIds(new Set());
                      }}
                    />
                    Defenders won
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="attack-outcome"
                      value="barbarians-win"
                      checked={outcomeType === "barbarians-win"}
                      disabled={busy}
                      onChange={() => {
                        setOutcomeType("barbarians-win");
                        setRewardType(null);
                        setSoleDefenderId("");
                        setTiedDefenderIds(new Set());
                        setProgressChoices({});
                        setPillagedPlayerIds(new Set());
                      }}
                    />
                    Barbarians won
                  </label>
                </div>
              </fieldset>

              {outcomeType === "defenders-win" && (
                <fieldset className="attack-reward-fieldset">
                  <legend>Defender reward</legend>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        name="reward-type"
                        value="defender-point"
                        checked={rewardType === "defender-point"}
                        disabled={busy}
                        onChange={() => {
                          setRewardType("defender-point");
                          setTiedDefenderIds(new Set());
                          setProgressChoices({});
                        }}
                      />
                      Sole top contributor (Defender point)
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="reward-type"
                        value="progress-choice"
                        checked={rewardType === "progress-choice"}
                        disabled={busy}
                        onChange={() => {
                          setRewardType("progress-choice");
                          setSoleDefenderId("");
                        }}
                      />
                      Tied contributors (progress deck each)
                    </label>
                  </div>

                  {rewardType === "defender-point" && (
                    <label className="field">
                      <span>Sole top contributor</span>
                      <select
                        value={soleDefenderId}
                        disabled={busy}
                        onChange={(event) =>
                          setSoleDefenderId(event.target.value)
                        }
                      >
                        <option value="">Choose a player</option>
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {rewardType === "progress-choice" && (
                    <>
                      <p className="fine-print">
                        Select 2 or more tied top contributors.
                      </p>
                      <div className="checkbox-group">
                        {players.map((player) => (
                          <label key={player.id}>
                            <input
                              type="checkbox"
                              checked={tiedDefenderIds.has(player.id)}
                              disabled={busy}
                              onChange={(event) => {
                                setTiedDefenderIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) {
                                    next.add(player.id);
                                  } else {
                                    next.delete(player.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                            {player.name}
                          </label>
                        ))}
                      </div>
                      {tiedDefenderIds.size >= 2 && (
                        <div className="resolution-choice-grid">
                          {[...tiedDefenderIds].map((id) => {
                            const player = players.find((p) => p.id === id);
                            if (!player) return null;
                            return (
                              <label key={id} className="field">
                                <span>{player.name}'s progress deck</span>
                                <select
                                  value={progressChoices[id] ?? ""}
                                  disabled={busy}
                                  onChange={(event) => {
                                    setProgressChoices((current) => ({
                                      ...current,
                                      [id]: event.target.value as
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
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </fieldset>
              )}

              {outcomeType === "barbarians-win" && (
                <fieldset className="attack-pillage-fieldset">
                  <legend>Pillaged players</legend>
                  {vulnerablePlayers.length === 0 ? (
                    <StatusBanner>
                      No recorded player has an ordinary city to pillage.
                    </StatusBanner>
                  ) : (
                    <>
                      <p className="fine-print">
                        Select players who downgrade an ordinary city. Only
                        players with ordinary cities are shown.
                      </p>
                      <div className="checkbox-group">
                        {vulnerablePlayers.map((player) => (
                          <label key={player.id}>
                            <input
                              type="checkbox"
                              checked={pillagedPlayerIds.has(player.id)}
                              disabled={busy}
                              onChange={(event) => {
                                setPillagedPlayerIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) {
                                    next.add(player.id);
                                  } else {
                                    next.delete(player.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                            {player.name} ({player.ordinaryCities}{" "}
                            {player.ordinaryCities === 1 ? "city" : "cities"})
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </fieldset>
              )}

              {attack.firstAttack ? (
                <StatusBanner>
                  Completing this first attack activates the robber for later
                  rolls of 7.
                </StatusBanner>
              ) : null}
              <p className="fine-print">
                Continuing confirms the attack, resets the ship, and deactivates
                every active knight.
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
          <h3 id="production-heading" className="sr-only">
            Production
          </h3>
          {isSeven ? (
            view.production.robberActivated ? (
              <StatusBanner tone="warning">
                Discard above the safe hand limit, then move the robber and
                steal. City walls increase the safe limit.
              </StatusBanner>
            ) : (
              <StatusBanner>
                Discard above the safe hand limit; the robber stays inactive
                until the first barbarian attack.
              </StatusBanner>
            )
          ) : (
            <StatusBanner tone="success">
              Distribute resources and commodities for production{" "}
              {view.production.total}.
            </StatusBanner>
          )}
        </section>

        <footer className="roll-resolution__actions">
          <p className="fine-print">
            End {view.currentPlayerName}'s turn and advance to{" "}
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
                onContinue(resolution);
              }}
            >
              Continue current turn
            </Button>
            <Button
              size="large"
              disabled={busy || !choicesReady}
              onClick={() => {
                onQuickRoll(resolution);
              }}
            >
              {busy ? "Saving..." : `Next: ${view.nextPlayerName}`}
            </Button>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}
