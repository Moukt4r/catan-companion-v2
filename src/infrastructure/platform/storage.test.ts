import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorageStatus, requestPersistentStorage } from "./storage";

const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  } else {
    Reflect.deleteProperty(navigator, "storage");
  }
});

describe("browser storage helpers", () => {
  it("returns unknown values when the Storage API is unavailable", async () => {
    Reflect.deleteProperty(navigator, "storage");

    await expect(getStorageStatus()).resolves.toEqual({
      persisted: null,
      quota: null,
      usage: null,
    });
    await expect(requestPersistentStorage()).resolves.toBeNull();
  });

  it("reports estimates and persistence state", async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    const estimate = vi.fn().mockResolvedValue({ quota: 1_000, usage: 250 });
    const persist = vi.fn().mockResolvedValue(false);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persisted, estimate, persist },
    });

    await expect(getStorageStatus()).resolves.toEqual({
      persisted: true,
      quota: 1_000,
      usage: 250,
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
    expect(persisted).toHaveBeenCalledOnce();
    expect(estimate).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it("uses false and null fallbacks for optional estimate fields", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: vi.fn().mockResolvedValue({}),
      },
    });

    await expect(getStorageStatus()).resolves.toEqual({
      persisted: false,
      quota: null,
      usage: null,
    });
  });
});
