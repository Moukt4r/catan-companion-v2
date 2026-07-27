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
}

interface RollResolutionDialogProps {
  open: boolean;
  view: RollResolutionView;
  busy: boolean;
  onPause: () => void;
  onContinue: () => void;
  onQuickRoll: () => void;
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
            <DieFace kind="yellow" label="White die" value={view.roll.yellow} />
            <span aria-hidden>+</span>
            <div className="event-dice-pair">
              <DieFace
                kind="red"
                label="Red die"
                value={view.roll.red}
                eventFace={view.roll.event}
              />
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

          {view.progress ? (
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
              disabled={busy}
              onClick={() => {
                onContinue();
              }}
            >
              Continue current turn
            </Button>
            <Button
              size="large"
              disabled={busy}
              onClick={() => {
                onQuickRoll();
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
