import { useEffect, useState } from "react";
import harborIllustration from "../../../assets/illustrations/harbor-watch.webp";
import resourceIllustration from "../../../assets/illustrations/resource-landscape.webp";
import { Button, DieFace, PlayerMarker, StatusBanner } from "../../components";
import { formatDuration } from "./time";

const MOBILE_BARBARIAN_QUERY = "(max-width: 600px)";

function barbarianPanelStartsOpen(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    !window.matchMedia(MOBILE_BARBARIAN_QUERY).matches
  );
}

export interface GamePlayerView {
  id: string;
  name: string;
  color: string;
  victoryPoints: number;
  activeTimeMs: number;
  current: boolean;
}

export interface GameTableView {
  title: string;
  phaseLabel: string;
  currentPlayerName: string;
  currentPlayerColor: string;
  nextPlayerName: string;
  round: number;
  turnNumber: number;
  savedLabel: string;
  saveTone: "info" | "success" | "warning" | "danger";
  offline: boolean;
  readOnly: boolean;
  paused: boolean;
  canRoll: boolean;
  canContinueRoll: boolean;
  showNextRoll: boolean;
  canRollNextTurn: boolean;
  canEditPublicState: boolean;
  canPause: boolean;
  currentTurnMs: number;
  totalGameMs: number;
  rolling: boolean;
  lastRoll: {
    red: number;
    yellow: number;
    event: "barbarian" | "science" | "trade" | "politics";
    total: number;
    source: "balanced" | "alchemy";
    progress: {
      discipline: "science" | "trade" | "politics";
      redValue: number;
      eligiblePlayers: {
        id: string;
        name: string;
      }[];
    } | null;
    production: {
      robberActivated: boolean;
    };
  } | null;
  numberedCycleProgress: string;
  barbarian: {
    position: number;
    trackLength: number;
    strength: number;
    defenderStrength: number;
    attackPending: boolean;
  };
  players: GamePlayerView[];
  houseEventPending: boolean;
  houseEvent: {
    title: string;
    instruction: string;
  } | null;
  winnerCandidateName: string | null;
}

interface GameTableProps {
  view: GameTableView;
  busy?: boolean;
  onRoll: () => void;
  onAlchemy: () => void;
  onAdjustScore: (playerId: string, delta: -1 | 1) => void;
  onEditPlayer: (playerId: string) => void;
  onNextRoll: () => void;
  onContinueRoll: () => void;
  onAcknowledgeEvent: () => void;
  onPause: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onExport: () => void;
  onConfirmWinner: () => void;
}

const disciplineNames = {
  politics: "Politics",
  science: "Science",
  trade: "Trade",
};

function barbarianRisk(
  strength: number,
  defenderStrength: number,
): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (defenderStrength > strength) {
    return {
      label: "Defended",
      tone: "success",
    };
  }
  if (defenderStrength === strength) {
    return {
      label: "Tied",
      tone: "warning",
    };
  }
  return {
    label: "Exposed",
    tone: "danger",
  };
}

function productionGuidance(
  roll: NonNullable<GameTableView["lastRoll"]>,
): string {
  if (roll.total !== 7) {
    return `Distribute resources and commodities for production ${roll.total}.`;
  }

  return roll.production.robberActivated
    ? "Discard above the safe hand limit, then move the robber and steal."
    : "Discard above the safe hand limit; the robber stays inactive until the first barbarian attack.";
}

function eventGuidance(
  roll: NonNullable<GameTableView["lastRoll"]>,
  barbarian: GameTableView["barbarian"],
): string {
  if (!roll.progress) {
    return barbarian.attackPending
      ? "The barbarian attack needs confirmation."
      : `The barbarian ship advanced to ${barbarian.position} of ${barbarian.trackLength}.`;
  }

  const eligibleNames = roll.progress.eligiblePlayers.map(
    (player) => player.name,
  );
  const eligibility =
    eligibleNames.length === 0
      ? "No recorded player is eligible."
      : `${eligibleNames.join(", ")} ${
          eligibleNames.length === 1 ? "is" : "are"
        } eligible; draw in current-player order.`;

  return `${disciplineNames[roll.progress.discipline]} progress with red ${roll.progress.redValue}. ${eligibility}`;
}

export function GameTable({
  busy = false,
  onAlchemy,
  onAdjustScore,
  onAcknowledgeEvent,
  onContinueRoll,
  onConfirmWinner,
  onEditPlayer,
  onNextRoll,
  onPause,
  onExport,
  onHistory,
  onRoll,
  onSettings,
  view,
}: GameTableProps) {
  const spacesRemaining = Math.max(
    0,
    view.barbarian.trackLength - view.barbarian.position,
  );
  const spacesLabel = `${spacesRemaining} ${
    spacesRemaining === 1 ? "space" : "spaces"
  }`;
  const risk = barbarianRisk(
    view.barbarian.strength,
    view.barbarian.defenderStrength,
  );
  const playerControlsDisabled =
    busy || !view.canEditPublicState || view.readOnly || view.paused;
  const [barbarianOpen, setBarbarianOpen] = useState(barbarianPanelStartsOpen);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query = window.matchMedia(MOBILE_BARBARIAN_QUERY);
    const updateForViewport = () => {
      setBarbarianOpen(!query.matches);
    };
    query.addEventListener("change", updateForViewport);
    return () => {
      query.removeEventListener("change", updateForViewport);
    };
  }, []);

  return (
    <main
      className={`game-layout${view.showNextRoll ? " game-layout--turn-action" : ""}`}
    >
      <header className="game-header">
        <div>
          <p className="eyebrow">{view.title}</p>
          <PlayerMarker
            color={view.currentPlayerColor}
            label={`${view.currentPlayerName}'s turn`}
          />
          <p className="game-meta">
            Round {view.round} · Turn {view.turnNumber} · {view.phaseLabel}
          </p>
          <div className="game-clock-row" aria-label="Game timers">
            <span>
              Turn <strong>{formatDuration(view.currentTurnMs)}</strong>
            </span>
            <span>
              Game <strong>{formatDuration(view.totalGameMs)}</strong>
            </span>
          </div>
        </div>
        <div className="game-header__actions">
          {view.offline ? (
            <span className="save-pill save-pill--info">Offline</span>
          ) : null}
          {view.readOnly ? (
            <span className="save-pill save-pill--warning">Read only</span>
          ) : null}
          {view.paused ? (
            <span className="save-pill save-pill--warning">Paused</span>
          ) : null}
          <span className={`save-pill save-pill--${view.saveTone}`}>
            {view.savedLabel}
          </span>
          <Button
            variant="quiet"
            size="small"
            disabled={view.paused}
            onClick={onHistory}
          >
            History
          </Button>
          <Button
            variant="quiet"
            size="small"
            disabled={view.paused}
            onClick={onExport}
          >
            Export
          </Button>
          <Button
            variant="quiet"
            size="small"
            disabled={view.paused}
            onClick={onSettings}
          >
            Settings
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={!view.canPause || view.readOnly || view.paused}
            onClick={onPause}
          >
            Pause
          </Button>
        </div>
      </header>

      {view.winnerCandidateName ? (
        <StatusBanner tone="success">
          <div className="winner-banner">
            <span>
              {view.winnerCandidateName} has reached the victory target.
            </span>
            <Button
              size="small"
              disabled={view.readOnly || view.paused}
              onClick={onConfirmWinner}
            >
              Confirm winner
            </Button>
          </div>
        </StatusBanner>
      ) : null}

      <section className="surface roll-stage" aria-labelledby="roll-heading">
        <img
          className="roll-stage__art"
          src={resourceIllustration}
          alt=""
          aria-hidden="true"
        />
        <div className="roll-stage__intro">
          <div>
            <p className="rule-label rule-label--house">Balanced house dice</p>
            <h1 id="roll-heading">Roll for {view.currentPlayerName}</h1>
          </div>
          <span className="cycle-progress">{view.numberedCycleProgress}</span>
        </div>

        <div className="dice-row">
          <DieFace
            kind="red"
            label="Red die"
            value={view.lastRoll?.red ?? null}
            rolling={view.rolling}
          />
          <span className="dice-operator" aria-hidden>
            +
          </span>
          <DieFace
            kind="yellow"
            label="Yellow die"
            value={view.lastRoll?.yellow ?? null}
            rolling={view.rolling}
          />
          <span className="dice-total">
            {view.lastRoll ? `= ${view.lastRoll.total}` : ""}
          </span>
          <DieFace
            kind="event"
            label="Event die"
            value={view.lastRoll?.event ?? null}
            rolling={view.rolling}
          />
        </div>

        {view.canRoll ? (
          <div className="roll-actions">
            <Button
              size="large"
              block
              disabled={view.readOnly || view.paused}
              onClick={onRoll}
            >
              Roll
            </Button>
            <Button
              size="large"
              block
              variant="secondary"
              disabled={view.readOnly || view.paused}
              onClick={onAlchemy}
            >
              Use Alchemy
            </Button>
          </div>
        ) : (
          <div className="roll-result-summary">
            {view.lastRoll ? (
              <>
                <div className="roll-result-summary__heading">
                  <strong>
                    {view.lastRoll.red} + {view.lastRoll.yellow} ={" "}
                    {view.lastRoll.total}
                  </strong>
                  <span>
                    {view.lastRoll.event} event ·{" "}
                    {view.lastRoll.source === "alchemy"
                      ? "Chosen with Alchemy"
                      : "Balanced draw"}
                  </span>
                </div>
                <dl className="roll-guidance">
                  <div>
                    <dt>Numbered dice</dt>
                    <dd>{productionGuidance(view.lastRoll)}</dd>
                  </div>
                  <div>
                    <dt>Event die</dt>
                    <dd>{eventGuidance(view.lastRoll, view.barbarian)}</dd>
                  </div>
                </dl>
                {view.canContinueRoll ? (
                  <Button
                    size="small"
                    disabled={busy || view.readOnly || view.paused}
                    onClick={onContinueRoll}
                  >
                    {busy ? "Saving..." : "Continue roll"}
                  </Button>
                ) : null}
                {view.houseEvent ? (
                  <section
                    className="inline-house-event"
                    aria-labelledby="inline-house-event-heading"
                  >
                    <div>
                      <p className="rule-label rule-label--house">
                        House event
                      </p>
                      <h2 id="inline-house-event-heading">
                        {view.houseEvent.title}
                      </h2>
                      <p>{view.houseEvent.instruction}</p>
                    </div>
                    <Button
                      size="small"
                      disabled={busy || view.readOnly || view.paused}
                      onClick={onAcknowledgeEvent}
                    >
                      Acknowledge house event
                    </Button>
                  </section>
                ) : null}
              </>
            ) : (
              <span>Complete the current resolution to continue.</span>
            )}
          </div>
        )}
      </section>

      <div className="game-sidebar">
        <aside className="surface barbarian-card" aria-label="Barbarian track">
          <details
            className="barbarian-details"
            open={barbarianOpen}
            onToggle={(event) => {
              if (
                typeof window.matchMedia !== "function" ||
                window.matchMedia(MOBILE_BARBARIAN_QUERY).matches
              ) {
                setBarbarianOpen(event.currentTarget.open);
              }
            }}
          >
            <summary className="barbarian-summary">
              <span className="barbarian-summary__copy">
                <span className="eyebrow">Cities &amp; Knights</span>
                <strong>{spacesLabel} until attack</strong>
              </span>
              <span className={`risk-badge risk-badge--${risk.tone}`}>
                {risk.label}
              </span>
            </summary>
            <div className="barbarian-details__body">
              <div className="barbarian-card__visual" aria-hidden="true">
                <img src={harborIllustration} alt="" />
              </div>
              <div className="barbarian-card__heading">
                <div>
                  <p className="eyebrow">Cities &amp; Knights</p>
                  <h2>Barbarian track</h2>
                </div>
                <span className={`risk-badge risk-badge--${risk.tone}`}>
                  {risk.label}
                </span>
              </div>
              <div
                className="barbarian-track"
                role="meter"
                aria-label={`${spacesLabel} until the barbarian attack`}
                aria-valuemin={0}
                aria-valuemax={view.barbarian.trackLength}
                aria-valuenow={view.barbarian.position}
              >
                {Array.from(
                  { length: view.barbarian.trackLength },
                  (_, index) => (
                    <span
                      key={index}
                      className={
                        index < view.barbarian.position
                          ? "barbarian-track__filled"
                          : ""
                      }
                    />
                  ),
                )}
              </div>
              <p className="barbarian-distance">{spacesLabel} until attack</p>
              <dl className="definition-grid">
                <div>
                  <dt>Barbarians</dt>
                  <dd>{view.barbarian.strength}</dd>
                </div>
                <div>
                  <dt>Active defense</dt>
                  <dd>{view.barbarian.defenderStrength}</dd>
                </div>
              </dl>
            </div>
          </details>
        </aside>

        {view.showNextRoll ? (
          <aside className="surface turn-action-dock" aria-label="Next turn">
            <div className="turn-action-dock__copy">
              <span>Turn complete</span>
              <strong>{view.nextPlayerName} is next</strong>
            </div>
            <Button
              size="large"
              block
              disabled={
                busy || !view.canRollNextTurn || view.readOnly || view.paused
              }
              onClick={onNextRoll}
            >
              Next: {view.nextPlayerName} &amp; roll
            </Button>
          </aside>
        ) : null}
      </div>

      <section
        className="player-strip"
        aria-label="Player points and time"
        tabIndex={0}
      >
        {view.players.map((player) => (
          <article
            key={player.id}
            className={`surface player-card${player.current ? " player-card--current" : ""}`}
          >
            <div className="player-card__header">
              <PlayerMarker color={player.color} label={player.name} />
              {player.current ? (
                <span className="current-chip">Current</span>
              ) : null}
            </div>
            <div className="player-card__summary">
              <div
                className="player-score"
                aria-label={`${player.name} has ${player.victoryPoints} public points`}
              >
                <strong>{player.victoryPoints}</strong>
                <span>points</span>
              </div>
              <div
                className="player-time"
                aria-label={`${player.name} active time ${formatDuration(player.activeTimeMs)}`}
              >
                <span>Time</span>
                <strong>{formatDuration(player.activeTimeMs)}</strong>
              </div>
            </div>
            <div className="player-card__actions">
              <Button
                variant="secondary"
                size="small"
                aria-label={`Decrease ${player.name} points`}
                disabled={playerControlsDisabled || player.victoryPoints <= 0}
                onClick={() => {
                  onAdjustScore(player.id, -1);
                }}
              >
                -
              </Button>
              <Button
                variant="quiet"
                size="small"
                aria-label={`Edit ${player.name} details`}
                disabled={playerControlsDisabled}
                onClick={() => {
                  onEditPlayer(player.id);
                }}
              >
                Details
              </Button>
              <Button
                variant="secondary"
                size="small"
                aria-label={`Increase ${player.name} points`}
                disabled={playerControlsDisabled}
                onClick={() => {
                  onAdjustScore(player.id, 1);
                }}
              >
                +
              </Button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
