import type { GameId } from "../domain";

export interface GameControl {
  acquire(gameId: GameId): Promise<boolean>;
  hasControl(gameId: GameId): boolean;
  release(): Promise<void>;
}
