import { afterEach, describe, expect, it, vi } from "vitest";
import { asGameId, asRevisionId } from "../domain";
import { BrowserGameChannel } from "./broadcast";

class BroadcastChannelMock {
  static instances: BroadcastChannelMock[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly close = vi.fn();

  constructor(readonly name: string) {
    BroadcastChannelMock.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

describe("BrowserGameChannel", () => {
  afterEach(() => {
    BroadcastChannelMock.instances = [];
    vi.unstubAllGlobals();
  });

  it("posts and forwards only valid channel messages", () => {
    vi.stubGlobal("BroadcastChannel", BroadcastChannelMock);
    const channel = new BrowserGameChannel("test-channel");
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    const native = BroadcastChannelMock.instances[0];
    const revision = {
      type: "revision" as const,
      tabId: "other",
      gameId: asGameId("game"),
      revisionId: asRevisionId("revision"),
    };

    channel.post(revision);
    native?.emit(null);
    native?.emit({ type: "presence", tabId: 1 });
    native?.emit({ type: "unknown", tabId: "tab" });
    native?.emit({ type: "presence", tabId: "tab" });
    native?.emit(revision);

    expect(native?.name).toBe("test-channel");
    expect(native?.postMessage).toHaveBeenCalledWith(revision);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    native?.emit(revision);
    channel.close();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(native?.close).toHaveBeenCalledOnce();
  });

  it("is a safe no-op when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = new BrowserGameChannel();
    const listener = vi.fn();

    channel.subscribe(listener);
    expect(() =>
      channel.post({ type: "presence", tabId: "tab" }),
    ).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });
});
