import { Button, PlayerMarker } from "../../components";

export interface GameCompleteView {
  title: string;
  winnerName: string;
  winnerColor: string;
  completedAt: string;
  rounds: number;
  turns: number;
  durationMinutes: number;
  rolls: number;
  barbarianAttacks: number;
  thematicEvents: number;
  players: {
    id: string;
    name: string;
    color: string;
    victoryPoints: number;
  }[];
}

interface GameCompleteScreenProps {
  view: GameCompleteView;
  onExport: () => void;
  onHome: () => void;
  onNewGame: () => void;
}

export function GameCompleteScreen({
  onExport,
  onHome,
  onNewGame,
  view,
}: GameCompleteScreenProps) {
  return (
    <main className="app-shell completed-layout">
      <section className="surface completed-hero">
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
      </section>

      <section className="summary-grid" aria-label="Game summary">
        <article className="surface summary-card">
          <span>Turns</span>
          <strong>{view.turns}</strong>
        </article>
        <article className="surface summary-card">
          <span>Duration</span>
          <strong>{view.durationMinutes} min</strong>
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
          <span>House events</span>
          <strong>{view.thematicEvents}</strong>
        </article>
      </section>

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
                <strong>{player.victoryPoints} VP</strong>
              </li>
            ))}
        </ol>
      </section>
    </main>
  );
}
