import type { GameId } from "../domain";

export interface GameControl {
  acquire(gameId: GameId): Promise<boolean>;
  release(): Promise<void>;
}
