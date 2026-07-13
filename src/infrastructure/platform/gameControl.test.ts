import { afterEach, describe, expect, it } from "vitest";
import { asGameId } from "../../domain";
import { BrowserGameControl } from "./gameControl";

const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

afterEach(() => {
  if (originalLocks) {
    Object.defineProperty(navigator, "locks", originalLocks);
  } else {
    Reflect.deleteProperty(navigator, "locks");
  }
});

describe("BrowserGameControl", () => {
  it("falls back to local control when Web Locks is unavailable", async () => {
    Reflect.deleteProperty(navigator, "locks");
    const control = new BrowserGameControl();

    await expect(control.acquire(asGameId("fallback-game"))).resolves.toBe(
      true,
    );
    await expect(control.release()).resolves.toBeUndefined();
    await expect(control.release()).resolves.toBeUndefined();
  });

  it("allows one controlling tab and a later explicit takeover", async () => {
    let locked = false;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        async request<T>(
          name: string,
          _options: { ifAvailable: true; mode: "exclusive" },
          callback: (lock: { name: string } | null) => Promise<T>,
        ): Promise<T> {
          if (locked) {
            return callback(null);
          }
          locked = true;
          try {
            return await callback({ name });
          } finally {
            locked = false;
          }
        },
      },
    });

    const first = new BrowserGameControl();
    const second = new BrowserGameControl();
    const gameId = asGameId("game-control-test");

    await expect(first.acquire(gameId)).resolves.toBe(true);
    await expect(second.acquire(gameId)).resolves.toBe(false);

    await first.release();
    await expect(second.acquire(gameId)).resolves.toBe(true);
    await second.release();
  });
});
