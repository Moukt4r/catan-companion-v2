import { Button, DieFace, PlayerMarker, StatusBanner } from "../../components";
import { formatDuration } from "./time";

export interface GamePlayerView {
  id: string;
  name: string;
  color: string;
  victoryPoints: number;
  ordinaryCities: number;
  metropolisDisciplines: string[];
  activeKnightStrength: number;
  activeTimeMs: number;
  improvements: {
    science: number;
    trade: number;
    politics: number;
  };
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
  showNextRoll: boolean;
  canRollNextTurn: boolean;
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
  } | null;
  numberedCycleProgress: string;
  barbarian: {
    position: number;
    trackLength: number;
    strength: number;
    defenderStrength: number;
  };
  players: GamePlayerView[];
  houseEventPending: boolean;
  winnerCandidateName: string | null;
}

interface GameTableProps {
  view: GameTableView;
  onRoll: () => void;
  onAlchemy: () => void;
  onEditPlayer: (playerId: string) => void;
  onNextRoll: () => void;
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
  onAlchemy,
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
  const risk = barbarianRisk(
    view.barbarian.strength,
    view.barbarian.defenderStrength,
  );

  return (
    <main className="game-layout">
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
          <span
            className="dice-total"
            aria-label={`Total ${view.lastRoll?.total ?? 0}`}
          >
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
              </>
            ) : (
              <span>Complete the current resolution to continue.</span>
            )}
          </div>
        )}
      </section>

      <aside
        className="surface barbarian-card"
        aria-labelledby="barbarian-heading"
      >
        <div className="barbarian-card__heading">
          <div>
            <p className="eyebrow">Cities &amp; Knights</p>
            <h2 id="barbarian-heading">Barbarian track</h2>
          </div>
          <span className={`risk-badge risk-badge--${risk.tone}`}>
            {risk.label}
          </span>
        </div>
        <div
          className="barbarian-track"
          role="meter"
          aria-label={`${spacesRemaining} spaces until the barbarian attack`}
          aria-valuemin={0}
          aria-valuemax={view.barbarian.trackLength}
          aria-valuenow={view.barbarian.position}
        >
          {Array.from({ length: view.barbarian.trackLength }, (_, index) => (
            <span
              key={index}
              className={
                index < view.barbarian.position ? "barbarian-track__filled" : ""
              }
            />
          ))}
        </div>
        <p className="barbarian-distance">
          {spacesRemaining} {spacesRemaining === 1 ? "space" : "spaces"} until
          attack
        </p>
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
      </aside>

      <section className="player-strip" aria-label="Players">
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
            <div className="player-score">
              <strong>{player.victoryPoints}</strong>
              <span>public VP</span>
            </div>
            <dl className="player-stats">
              <div>
                <dt>Cities</dt>
                <dd>{player.ordinaryCities}</dd>
              </div>
              <div>
                <dt>Metropolises</dt>
                <dd>{player.metropolisDisciplines.length}</dd>
              </div>
              <div>
                <dt>Active knights</dt>
                <dd>{player.activeKnightStrength}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>{formatDuration(player.activeTimeMs)}</dd>
              </div>
            </dl>
            <div
              className="improvement-row"
              aria-label={`${player.name} improvements`}
            >
              <span title="Science">S {player.improvements.science}</span>
              <span title="Trade">T {player.improvements.trade}</span>
              <span title="Politics">P {player.improvements.politics}</span>
            </div>
            <Button
              variant="secondary"
              block
              disabled={view.readOnly || view.paused}
              onClick={() => {
                onEditPlayer(player.id);
              }}
            >
              Edit public state
            </Button>
          </article>
        ))}
      </section>

      <footer className="turn-footer">
        {view.houseEventPending ? (
          <span className="house-event-indicator">
            House event requires acknowledgement
          </span>
        ) : (
          <span>All accepted actions are saved locally and can be undone.</span>
        )}
        {view.showNextRoll ? (
          <Button
            size="large"
            disabled={!view.canRollNextTurn || view.readOnly || view.paused}
            onClick={onNextRoll}
          >
            Next: {view.nextPlayerName} &amp; roll
          </Button>
        ) : null}
      </footer>
    </main>
  );
}
