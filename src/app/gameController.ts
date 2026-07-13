import {
  BrowserGameChannel,
  BrowserRuntimeDependencies,
  GameController,
} from "../application";
import { BrowserGameControl } from "../infrastructure/platform/gameControl";
import { IndexedDbGameRepository } from "../infrastructure/persistence";
import { WebCryptoRandomSource } from "../infrastructure/randomness";

export const gameRepository = new IndexedDbGameRepository();

export const gameController = new GameController(
  gameRepository,
  new WebCryptoRandomSource(),
  new BrowserRuntimeDependencies(),
  new BrowserGameChannel(),
  new BrowserGameControl(),
);
