import frontierIllustration from "../../../assets/illustrations/frontier-tabletop.webp";
import { Button, PlayerMarker } from "../../components";
import { formatDuration } from "./time";

export interface GameCompleteView {
  title: string;
  winnerName: string;
  winnerColor: string;
  completedAt: string;
  rounds: number;
  turns: number;
  totalGameMs: number;
  rolls: number;
  barbarianAttacks: number;
  thematicEvents: number;
  players: {
    id: string;
    name: string;
    color: string;
    victoryPoints: number;
    activeTimeMs: number;
  }[];
  statistics: {
    averageTotal: number | null;
    mostCommonTotal: number | null;
    rarestRolledTotal: number | null;
    alchemyRolls: number;
    normalRolls: number;
    yearChanges: number;
    diceTotals: {
      total: number;
      count: number;
      expected: number;
      deviation: number;
      share: number;
    }[];
    eventFaces: { face: string; count: number; share: number }[];
    players: {
      id: string;
      name: string;
      color: string;
      rolls: number;
      averageTotal: number | null;
      sevens: number;
      alchemyRolls: number;
      barbarianFaces: number;
      luckIndex: number;
      averageTurnMs: number | null;
      turns: number;
    }[];
    worldEventsByCategory: { category: string; count: number }[];
  };
}

interface GameCompleteScreenProps {
  view: GameCompleteView;
  onExport: () => void;
  onHome: () => void;
  onNewGame: () => void;
}

/** Percentage height for a histogram bar, guarding against an empty game. */
function barHeight(value: number, tallest: number): number {
  if (tallest <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / tallest) * 100));
}

/** Signed deviation, so "more often than expected" reads at a glance. */
function formatDeviation(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) {
    return "±0";
  }
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatAverage(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatShare(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function GameCompleteScreen({
  onExport,
  onHome,
  onNewGame,
  view,
}: GameCompleteScreenProps) {
  // Bars are scaled against the tallest column rather than the roll count, so
  // the shape stays readable in a short game as well as a long one.
  const tallestBar = view.statistics.diceTotals.reduce(
    (tallest, entry) => Math.max(tallest, entry.count, entry.expected),
    0,
  );

  return (
    <main className="app-shell completed-layout">
      <section className="surface completed-hero">
        <div className="completed-hero__copy">
          <p className="eyebrow">Game complete</p>
          <h1>{view.winnerName} wins</h1>
          <PlayerMarker color={view.winnerColor} label={view.title} />
          <p className="lede">
            Completed {new Date(view.completedAt).toLocaleString()} after{" "}
            {view.rounds} rounds.
          </p>
          <div className="button-row">
            <Button size="large" onClick={onExport}>
              Export full game
            </Button>
            <Button size="large" variant="secondary" onClick={onNewGame}>
              Start new game
            </Button>
            <Button size="large" variant="quiet" onClick={onHome}>
              Home
            </Button>
          </div>
        </div>
        <div className="completed-hero__art" aria-hidden="true">
          <img src={frontierIllustration} alt="" />
        </div>
      </section>

      <section className="summary-grid" aria-label="Game summary">
        <article className="surface summary-card">
          <span>Turns</span>
          <strong>{view.turns}</strong>
        </article>
        <article className="surface summary-card">
          <span>Duration</span>
          <strong>{formatDuration(view.totalGameMs)}</strong>
        </article>
        <article className="surface summary-card">
          <span>Rolls</span>
          <strong>{view.rolls}</strong>
        </article>
        <article className="surface summary-card">
          <span>Barbarian attacks</span>
          <strong>{view.barbarianAttacks}</strong>
        </article>
        <article className="surface summary-card">
          <span>World events</span>
          <strong>{view.thematicEvents}</strong>
        </article>
      </section>

      <section
        className="surface stats-block"
        aria-labelledby="dice-distribution-heading"
      >
        <h2 id="dice-distribution-heading">Dice distribution</h2>
        <p className="fine-print">
          What the table actually rolled, against what a fair deck would have
          produced over the same {view.rolls} rolls. Bars above the marker came
          up more often than expected.
        </p>
        <ol className="dice-histogram">
          {view.statistics.diceTotals.map((entry) => (
            <li key={entry.total}>
              <span className="dice-histogram__bar-wrap">
                <span
                  className="dice-histogram__bar"
                  style={{ height: `${barHeight(entry.count, tallestBar)}%` }}
                />
                <span
                  className="dice-histogram__expected"
                  style={{
                    bottom: `${barHeight(entry.expected, tallestBar)}%`,
                  }}
                  aria-hidden="true"
                />
              </span>
              <span className="dice-histogram__total">{entry.total}</span>
              <span className="dice-histogram__count">
                {entry.count}
                <small>{formatDeviation(entry.deviation)}</small>
              </span>
            </li>
          ))}
        </ol>
        <dl className="definition-grid">
          <div>
            <dt>Average roll</dt>
            <dd>{formatAverage(view.statistics.averageTotal)}</dd>
          </div>
          <div>
            <dt>Most common</dt>
            <dd>{view.statistics.mostCommonTotal ?? "—"}</dd>
          </div>
          <div>
            <dt>Rarest rolled</dt>
            <dd>{view.statistics.rarestRolledTotal ?? "—"}</dd>
          </div>
          <div>
            <dt>Alchemy rolls</dt>
            <dd>{view.statistics.alchemyRolls}</dd>
          </div>
          <div>
            <dt>Deck reshuffles</dt>
            <dd>{view.statistics.yearChanges}</dd>
          </div>
        </dl>
      </section>

      <section
        className="surface stats-block"
        aria-labelledby="player-stats-heading"
      >
        <h2 id="player-stats-heading">Player breakdown</h2>
        <p className="fine-print">
          Luck compares the pips a player rolled with an average seven per roll.
          It describes the dice, not the play.
        </p>
        <div className="stats-table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Rolls</th>
                <th scope="col">Average</th>
                <th scope="col">Sevens</th>
                <th scope="col">Barbarian</th>
                <th scope="col">Alchemy</th>
                <th scope="col">Luck</th>
                <th scope="col">Avg turn</th>
              </tr>
            </thead>
            <tbody>
              {view.statistics.players.map((player) => (
                <tr key={player.id}>
                  <th scope="row">
                    <PlayerMarker color={player.color} label={player.name} />
                  </th>
                  <td>{player.rolls}</td>
                  <td>{formatAverage(player.averageTotal)}</td>
                  <td>{player.sevens}</td>
                  <td>{player.barbarianFaces}</td>
                  <td>{player.alchemyRolls}</td>
                  <td>{formatDeviation(player.luckIndex)}</td>
                  <td>
                    {player.averageTurnMs === null
                      ? "—"
                      : formatDuration(player.averageTurnMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {view.statistics.eventFaces.length > 0 ||
      view.statistics.worldEventsByCategory.length > 0 ? (
        <section
          className="surface stats-block"
          aria-labelledby="event-stats-heading"
        >
          <h2 id="event-stats-heading">Events</h2>
          <div className="stats-columns">
            {view.statistics.eventFaces.length > 0 ? (
              <div>
                <h3>Event die</h3>
                <ul className="stats-list">
                  {view.statistics.eventFaces.map((entry) => (
                    <li key={entry.face}>
                      <span>{entry.face}</span>
                      <strong>{entry.count}</strong>
                      <small>{formatShare(entry.share)}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {view.statistics.worldEventsByCategory.length > 0 ? (
              <div>
                <h3>World events</h3>
                <ul className="stats-list">
                  {view.statistics.worldEventsByCategory.map((entry) => (
                    <li key={entry.category}>
                      <span>{entry.category}</span>
                      <strong>{entry.count}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        className="surface final-scores"
        aria-labelledby="final-scores-heading"
      >
        <h2 id="final-scores-heading">Final public scores</h2>
        <ol>
          {view.players
            .slice()
            .sort((left, right) => right.victoryPoints - left.victoryPoints)
            .map((player) => (
              <li key={player.id}>
                <PlayerMarker color={player.color} label={player.name} />
                <span className="final-player-result">
                  <strong>{player.victoryPoints} VP</strong>
                  <small>{formatDuration(player.activeTimeMs)}</small>
                </span>
              </li>
            ))}
        </ol>
      </section>
    </main>
  );
}
