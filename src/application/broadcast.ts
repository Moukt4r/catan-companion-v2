import type { GameId, RevisionId } from "../domain";

export type GameChannelMessage =
  | { type: "presence"; tabId: string }
  | {
      type: "revision";
      tabId: string;
      gameId: GameId;
      revisionId: RevisionId;
    };

export interface GameChannel {
  post(message: GameChannelMessage): void;
  subscribe(listener: (message: GameChannelMessage) => void): () => void;
  close(): void;
}

export class BrowserGameChannel implements GameChannel {
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Set<(message: GameChannelMessage) => void>();

  constructor(name = "catan-table-companion") {
    this.channel =
      typeof globalThis.BroadcastChannel === "function"
        ? new BroadcastChannel(name)
        : null;
    if (this.channel !== null) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        if (isGameChannelMessage(event.data)) {
          for (const listener of this.listeners) {
            listener(event.data);
          }
        }
      };
    }
  }

  post(message: GameChannelMessage): void {
    this.channel?.postMessage(message);
  }

  subscribe(listener: (message: GameChannelMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.channel?.close();
    this.listeners.clear();
  }
}

function isGameChannelMessage(value: unknown): value is GameChannelMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  if (value.type === "presence") {
    return "tabId" in value && typeof value.tabId === "string";
  }
  return (
    value.type === "revision" &&
    "tabId" in value &&
    typeof value.tabId === "string" &&
    "gameId" in value &&
    typeof value.gameId === "string" &&
    "revisionId" in value &&
    typeof value.revisionId === "string"
  );
}
