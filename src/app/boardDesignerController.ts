import {
  BoardDesignerController,
  BrowserRuntimeDependencies,
} from "../application";
import { IndexedDbBoardDesignRepository } from "../infrastructure/persistence";
import { WebCryptoRandomSource } from "../infrastructure/randomness";

export const boardDesignRepository = new IndexedDbBoardDesignRepository();

export const boardDesignerController = new BoardDesignerController(
  boardDesignRepository,
  new WebCryptoRandomSource(),
  new BrowserRuntimeDependencies(),
);
