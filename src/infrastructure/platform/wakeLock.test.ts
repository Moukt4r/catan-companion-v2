import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenWakeLock } from "./wakeLock";

const originalWakeLock = Object.getOwnPropertyDescriptor(navigator, "wakeLock");

class Sentinel extends EventTarget {
  released = false;
  readonly release = vi.fn(() => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
    return Promise.resolve();
  });
}

afterEach(() => {
  if (originalWakeLock) {
    Object.defineProperty(navigator, "wakeLock", originalWakeLock);
  } else {
    Reflect.deleteProperty(navigator, "wakeLock");
  }
});

describe("ScreenWakeLock", () => {
  it("reports unsupported browsers without requesting a lock", async () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    const lock = new ScreenWakeLock();

    expect(lock.supported).toBe(false);
    expect(lock.active).toBe(false);
    await expect(lock.acquire()).resolves.toBe(false);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it("tracks acquisition, browser release events, and explicit release", async () => {
    const first = new Sentinel();
    const second = new Sentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    const lock = new ScreenWakeLock();

    expect(lock.supported).toBe(true);
    await expect(lock.acquire()).resolves.toBe(true);
    expect(lock.active).toBe(true);
    expect(request).toHaveBeenCalledWith("screen");

    first.released = true;
    first.dispatchEvent(new Event("release"));
    expect(lock.active).toBe(false);

    await lock.acquire();
    await lock.release();
    expect(second.release).toHaveBeenCalledOnce();
    expect(lock.active).toBe(false);
  });

  it("propagates wake-lock request failures", async () => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: vi.fn().mockRejectedValue(new Error("not allowed")),
      },
    });

    await expect(new ScreenWakeLock().acquire()).rejects.toThrow("not allowed");
  });
});
