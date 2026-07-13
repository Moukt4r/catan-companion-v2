import { Button, Dialog, PlayerMarker } from "../../components";

export interface CompletedGameSummary {
  id: string;
  title: string;
  status: "completed" | "archived";
  winnerName?: string;
  winnerColor?: string;
  currentPlayerName: string;
  currentPlayerColor: string;
  updatedAt: string;
  rounds: number;
  turns: number;
  playerNames: string[];
}

interface CompletedGamesDialogProps {
  open: boolean;
  games: CompletedGameSummary[];
  onResume: (gameId: string) => void;
  onExport: (gameId: string) => void;
  onDelete: (gameId: string) => void;
  onClose: () => void;
}

export function CompletedGamesDialog({
  games,
  onClose,
  onDelete,
  onExport,
  onResume,
  open,
}: CompletedGamesDialogProps) {
  return (
    <Dialog
      open={open}
      title="Saved games"
      description="Resume unfinished tables or manage completed game backups."
      onClose={onClose}
    >
      {games.length === 0 ? (
        <p>No games have been completed on this device yet.</p>
      ) : (
        <div className="archive-list">
          {games.map((game) => (
            <article key={game.id} className="archive-card">
              <div>
                <p className="eyebrow">
                  {new Date(game.updatedAt).toLocaleDateString()}
                </p>
                <h3>{game.title}</h3>
                {game.status === "completed" &&
                game.winnerName &&
                game.winnerColor ? (
                  <PlayerMarker
                    color={game.winnerColor}
                    label={`${game.winnerName} won`}
                  />
                ) : (
                  <PlayerMarker
                    color={game.currentPlayerColor}
                    label={`${game.currentPlayerName}'s turn`}
                  />
                )}
              </div>
              <dl className="definition-grid">
                <div>
                  <dt>Rounds</dt>
                  <dd>{game.rounds}</dd>
                </div>
                <div>
                  <dt>Turns</dt>
                  <dd>{game.turns}</dd>
                </div>
                <div>
                  <dt>Players</dt>
                  <dd>{game.playerNames.join(", ")}</dd>
                </div>
              </dl>
              <div className="button-row">
                <Button
                  size="small"
                  onClick={() => {
                    onResume(game.id);
                  }}
                >
                  {game.status === "archived" ? "Resume" : "View summary"}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    onExport(game.id);
                  }}
                >
                  Export
                </Button>
                <Button
                  variant="quiet"
                  size="small"
                  onClick={() => {
                    onDelete(game.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Dialog>
  );
}
