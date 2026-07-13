import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRuntimeDependencies } from "./runtime";

describe("BrowserRuntimeDependencies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses browser UUIDs and ISO timestamps", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T20:00:00.000Z"));
    const runtime = new BrowserRuntimeDependencies();

    expect(runtime.gameId()).toBe("00000000-0000-4000-8000-000000000001");
    expect(runtime.revisionId()).toBe("00000000-0000-4000-8000-000000000001");
    expect(runtime.commandId()).toBe("00000000-0000-4000-8000-000000000001");
    expect(runtime.now()).toBe("2026-07-12T20:00:00.000Z");
    expect(runtime.domainIds().next("roll")).toContain("roll-");
  });

  it("fails clearly when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", { subtle: crypto.subtle });
    const runtime = new BrowserRuntimeDependencies();

    expect(() => runtime.gameId()).toThrow(
      "Web Crypto randomUUID is unavailable.",
    );
    expect(() => runtime.revisionId()).toThrow(
      "Web Crypto randomUUID is unavailable.",
    );
    expect(() => runtime.commandId()).toThrow(
      "Web Crypto randomUUID is unavailable.",
    );
    expect(() => runtime.domainIds().next("roll")).toThrow(
      "Web Crypto randomUUID is unavailable.",
    );
  });
});
