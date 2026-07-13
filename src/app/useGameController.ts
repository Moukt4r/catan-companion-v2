import { useSyncExternalStore } from "react";
import { gameController } from "./gameController";

export function useGameController() {
  return useSyncExternalStore(
    gameController.subscribe,
    gameController.getSnapshot,
    gameController.getSnapshot,
  );
}
