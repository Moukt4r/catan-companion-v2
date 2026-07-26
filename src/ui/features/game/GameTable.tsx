import { useEffect, useState } from "react";
import harborIllustration from "../../../assets/illustrations/harbor-watch.webp";
import resourceIllustration from "../../../assets/illustrations/resource-landscape.webp";
import type { ActiveEventView, PendingWorldEventView } from "./viewMappers";
import type { Season } from "../../../domain";
import { Button, DieFace, PlayerMarker, StatusBanner } from "../../components";
import {
  SEASON_ART,
  WORLD_EVENT_ART,
  worldEventIllustration,
} from "../../illustrationCatalog";
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
  yearChange: {
    cycle: number;
    skipped: string[];
  } | null;
  barbarian: {
    position: number;
    trackLength: number;
    strength: number;
    defenderStrength: number;
    attackPending: boolean;
  };
  forecast: {
    advancesUntilAttack: number;
    attackImminent: boolean;
    defended: boolean;
    relevant: boolean;
    strength: number;
    defenderStrength: number;
    inactiveStrength: number;
    summary: string;
    verdict: string;
    pillagedNames: string[];
    rewardNames: string[];
  };
  players: GamePlayerView[];
  worldEventPending: boolean;
  worldEvent: PendingWorldEventView | null;
  activeEvents: ActiveEventView[];
  season: {
    current: Season;
    label: string;
    icon: string;
    roundInSeason: number;
    roundsPerSeason: number;
    transitioned: boolean;
  } | null;
  winnerCandidateName: string | null;
}

interface GameTableProps {
  view: GameTableView;
  busy?: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onRoll: () => void;
  onAlchemy: () => void;
  onAdjustScore: (playerId: string, delta: -1 | 1) => void;
  onEditPlayer: (playerId: string) => void;
  onNextRoll: () => void;
  onAlchemyNextTurn: () => void;
  onContinueRoll: () => void;
  onAcknowledgeEvent: () => void;
  onResolveEvent?: (occurrenceId: string) => void;
  onPause: () => void;
  onHistory: () => void;
  onSettings: () => void;
  onExport: () => void;
  onConfirmWinner: () => void;
}

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

export function GameTable({
  busy = false,
  soundEnabled = false,
  onToggleSound,
  onAlchemy,
  onAlchemyNextTurn,
  onAdjustScore,
  onAcknowledgeEvent,
  onResolveEvent,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const rollStageArt = view.season
    ? SEASON_ART[view.season.current]
    : resourceIllustration;
  const rollStageArtKey = view.season
    ? `season-${view.season.current}`
    : "neutral";

  // Escape closes the disclosure, which is the behaviour anyone who opened it
  // by accident will reach for first.
  useEffect(() => {
    if (!menuOpen || typeof window === "undefined") {
      return;
    }
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

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
          <p className="game-meta">
            Round {view.round} · Turn {view.turnNumber} · {view.phaseLabel}
          </p>
          {view.season ? (
            <p
              className="season-indicator"
              aria-label={`Current season: ${view.season.label}, round ${view.season.roundInSeason} of ${view.season.roundsPerSeason}`}
            >
              <span aria-hidden="true">{view.season.icon}</span>{" "}
              {view.season.label} ({view.season.roundInSeason}/
              {view.season.roundsPerSeason})
            </p>
          ) : null}
          {view.season?.transitioned ? (
            <div className="season-transition" role="status" aria-live="polite">
              <img
                className="season-transition__art"
                src={SEASON_ART[view.season.current]}
                alt=""
                aria-hidden="true"
                decoding="async"
              />
              <span>
                {view.season.icon} The season has changed to{" "}
                <strong>{view.season.label}</strong>
              </span>
            </div>
          ) : null}
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
          {/*
           * Pause sits beside Roll while it is someone's turn, where the player
           * is already looking. Once the roll is resolved that row is gone, so
           * the disclosure carries Pause for the rest of the turn.
           */}
          <div className="header-menu">
            <Button
              variant="quiet"
              size="small"
              disabled={view.paused}
              aria-expanded={menuOpen}
              aria-controls="game-header-menu"
              aria-label="More actions"
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
            >
              ⋯
            </Button>
            {menuOpen ? (
              <div
                id="game-header-menu"
                className="header-menu__panel"
                role="group"
                aria-label="More actions"
              >
                {view.canRoll ? null : (
                  <Button
                    variant="quiet"
                    size="small"
                    disabled={!view.canPause || view.readOnly || view.paused}
                    onClick={() => {
                      setMenuOpen(false);
                      onPause();
                    }}
                  >
                    Pause
                  </Button>
                )}
                <Button
                  variant="quiet"
                  size="small"
                  disabled={view.paused}
                  onClick={() => {
                    setMenuOpen(false);
                    onHistory();
                  }}
                >
                  History
                </Button>
                <Button
                  variant="quiet"
                  size="small"
                  disabled={view.paused}
                  onClick={() => {
                    setMenuOpen(false);
                    onExport();
                  }}
                >
                  Export
                </Button>
                <Button
                  variant="quiet"
                  size="small"
                  disabled={view.paused || busy}
                  aria-pressed={soundEnabled}
                  onClick={() => {
                    onToggleSound?.();
                  }}
                >
                  Sound {soundEnabled ? "on" : "off"}
                </Button>
                <Button
                  variant="quiet"
                  size="small"
                  disabled={view.paused}
                  onClick={() => {
                    setMenuOpen(false);
                    onSettings();
                  }}
                >
                  Settings
                </Button>
              </div>
            ) : null}
          </div>
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
        <div
          className={`roll-stage__art roll-stage__art--${rollStageArtKey}`}
          aria-hidden="true"
        >
          <img src={rollStageArt} alt="" decoding="async" />
          <span className="roll-stage__art-scrim" />
          <span className="roll-stage__art-label">
            {view.season
              ? `${view.season.label} at the frontier`
              : "The frontier table"}
          </span>
        </div>
        <div className="roll-stage__intro">
          <div>
            <p className="rule-label rule-label--house">Balanced house dice</p>
            <h1 id="roll-heading">Roll for {view.currentPlayerName}</h1>
          </div>
          <span className="cycle-progress">{view.numberedCycleProgress}</span>
        </div>

        {view.yearChange ? (
          <StatusBanner tone="info">
            <strong>Year {view.yearChange.cycle} begins.</strong>{" "}
            {view.yearChange.skipped.length === 0
              ? "The deck was reshuffled."
              : `The deck reshuffled early — ${view.yearChange.skipped.length} card${view.yearChange.skipped.length === 1 ? " was" : "s were"} never drawn: ${view.yearChange.skipped.join(", ")}.`}
          </StatusBanner>
        ) : null}

        <div className="dice-row">
          <DieFace
            kind="yellow"
            label="Yellow die"
            value={view.lastRoll?.yellow ?? null}
            rolling={view.rolling}
          />
          <span className="dice-operator" aria-hidden>
            +
          </span>
          <div className="event-dice-pair">
            <DieFace
              kind="red"
              label="Red die"
              value={view.lastRoll?.red ?? null}
              rolling={view.rolling}
            />
            <DieFace
              kind="event"
              label="Event die"
              value={view.lastRoll?.event ?? null}
              rolling={view.rolling}
            />
          </div>
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
            <Button
              size="large"
              block
              variant="quiet"
              disabled={!view.canPause || view.readOnly || view.paused}
              onClick={onPause}
            >
              Pause
            </Button>
          </div>
        ) : (
          <div className="roll-result-summary">
            {view.lastRoll ? (
              <>
                <div className="roll-result-summary__heading">
                  <strong>Production {view.lastRoll.total}</strong>
                  <span>
                    {view.lastRoll.event} event ·{" "}
                    {view.lastRoll.source === "alchemy"
                      ? "Chosen with Alchemy"
                      : "Balanced draw"}
                  </span>
                </div>
                {view.lastRoll.total === 7 && view.canContinueRoll ? (
                  <section
                    className={`roll-seven roll-seven--${
                      view.lastRoll.production.robberActivated
                        ? "active"
                        : "dormant"
                    }`}
                    aria-labelledby="roll-seven-heading"
                  >
                    <p className="rule-label rule-label--seven">Rolled a 7</p>
                    <h2 id="roll-seven-heading">
                      {view.lastRoll.production.robberActivated
                        ? "Discard, then move the robber"
                        : "Discard only — the robber is not active yet"}
                    </h2>
                    <p>
                      Every player above their safe hand limit discards half,
                      rounded down. City walls raise that limit by two each.
                    </p>
                    <p>
                      {view.lastRoll.production.robberActivated
                        ? "Then move the robber to a new hex and steal one card from a player building on it."
                        : "The robber stays where it is until the first barbarian attack has been resolved."}
                    </p>
                  </section>
                ) : null}
                {view.canContinueRoll ? (
                  <Button
                    size="small"
                    disabled={busy || view.readOnly || view.paused}
                    onClick={onContinueRoll}
                  >
                    {busy
                      ? "Saving..."
                      : view.lastRoll.total === 7
                        ? "Acknowledge the 7"
                        : "Continue roll"}
                  </Button>
                ) : null}
                {view.worldEvent ? (
                  <section
                    className="inline-world-event"
                    aria-labelledby="inline-world-event-heading"
                  >
                    <img
                      className="inline-world-event__art"
                      src={worldEventIllustration(view.worldEvent.eventId)}
                      alt=""
                      aria-hidden="true"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src =
                          WORLD_EVENT_ART[view.worldEvent!.category];
                      }}
                    />
                    <div className="inline-world-event__copy">
                      <p className="rule-label rule-label--world-event">
                        World Event (house rule)
                      </p>
                      <h2 id="inline-world-event-heading">
                        {view.worldEvent.title}
                      </h2>
                      <p>{view.worldEvent.instruction}</p>
                      <dl className="world-event-meta">
                        <div>
                          <dt>Tone</dt>
                          <dd>{view.worldEvent.toneLabel}</dd>
                        </div>
                        <div>
                          <dt>Impact</dt>
                          <dd>{view.worldEvent.impact} / 3</dd>
                        </div>
                        <div>
                          <dt>Timing</dt>
                          <dd>{view.worldEvent.timingCopy}</dd>
                        </div>
                      </dl>
                    </div>
                    <Button
                      size="small"
                      disabled={busy || view.readOnly || view.paused}
                      onClick={onAcknowledgeEvent}
                    >
                      Acknowledge world event
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
                className={`barbarian-track barbarian-track--threat-${Math.min(
                  view.barbarian.position,
                  view.barbarian.trackLength,
                )}`}
                role="meter"
                aria-label={`${spacesLabel} until the barbarian attack`}
                aria-valuemin={0}
                aria-valuemax={view.barbarian.trackLength}
                aria-valuenow={view.barbarian.position}
              >
                {Array.from(
                  { length: view.barbarian.trackLength },
                  (_, index) => {
                    const advanced = index < view.barbarian.position;
                    const current = index === view.barbarian.position - 1;
                    return (
                      <span
                        key={index}
                        className={`barbarian-step${
                          advanced ? " barbarian-step--advanced" : ""
                        }${current ? " barbarian-step--current" : ""}`}
                      />
                    );
                  },
                )}
              </div>
              <p
                className={`barbarian-distance barbarian-forecast barbarian-forecast--${
                  !view.forecast.relevant
                    ? "quiet"
                    : view.forecast.defended
                      ? "held"
                      : view.forecast.attackImminent
                        ? "imminent"
                        : "falls"
                }`}
              >
                {spacesLabel} until attack · barbarians{" "}
                {view.barbarian.strength} vs defense{" "}
                {view.barbarian.defenderStrength}
                {view.forecast.relevant ? (
                  <span className="barbarian-forecast__verdict">
                    {view.forecast.verdict}
                  </span>
                ) : null}
              </p>
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
              Next: {view.nextPlayerName}
            </Button>
            <Button
              size="large"
              block
              variant="secondary"
              disabled={
                busy || !view.canRollNextTurn || view.readOnly || view.paused
              }
              onClick={onAlchemyNextTurn}
            >
              Alchemy: {view.nextPlayerName}
            </Button>
          </aside>
        ) : null}
      </div>

      {view.activeEvents.length > 0 ? (
        <section
          className="active-events-strip"
          aria-label="Active world events"
        >
          <h2 className="active-events-strip__heading">Active World Events</h2>
          <ul className="active-events-list">
            {view.activeEvents.map((event) => (
              <li
                key={event.occurrenceId}
                className={`surface active-event-card active-event-card--${event.tone}`}
              >
                <img
                  className="active-event-card__art"
                  src={worldEventIllustration(event.eventId)}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  onError={(imageEvent) => {
                    imageEvent.currentTarget.onerror = null;
                    imageEvent.currentTarget.src =
                      WORLD_EVENT_ART[event.category];
                  }}
                />
                <div className="active-event-card__body">
                  <div className="active-event-card__header">
                    <span className="rule-label rule-label--world-event">
                      World Event (house rule)
                    </span>
                    <span className="active-event-card__timing">
                      {event.timingCopy}
                    </span>
                  </div>
                  <strong>{event.title}</strong>
                  <p>{event.instruction}</p>
                  {event.canResolve && onResolveEvent ? (
                    <Button
                      size="small"
                      disabled={busy || view.readOnly || view.paused}
                      onClick={() => {
                        onResolveEvent(event.occurrenceId);
                      }}
                    >
                      Mark resolved
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
