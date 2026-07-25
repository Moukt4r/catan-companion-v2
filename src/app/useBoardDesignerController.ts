import { useSyncExternalStore } from "react";
import { boardDesignerController } from "./boardDesignerController";

export function useBoardDesignerController() {
  return useSyncExternalStore(
    boardDesignerController.subscribe,
    boardDesignerController.getSnapshot,
    boardDesignerController.getSnapshot,
  );
}
