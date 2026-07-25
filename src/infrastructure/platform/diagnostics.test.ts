import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSanitizedDiagnostics, copyText } from "./diagnostics";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("diagnostics", () => {
  it("builds a sanitized capability and storage report", () => {
    const diagnostics = JSON.parse(
      buildSanitizedDiagnostics({
        appVersion: "1.2.3",
        schemaVersion: 4,
        activeRevision: "revision-1",
        lastSavedAt: "2026-07-12T12:00:00.000Z",
        storage: { persisted: true, quota: 100, usage: 25 },
        season: { name: "autumn", roundInSeason: 2, roundsPerSeason: 3 },
      }),
    ) as Record<string, unknown>;

    expect(diagnostics).toMatchObject({
      appVersion: "1.2.3",
      schemaVersion: 4,
      activeRevision: "revision-1",
      storage: { persisted: true, quota: 100, usage: 25 },
      season: { name: "autumn", roundInSeason: 2, roundsPerSeason: 3 },
      online: navigator.onLine,
      capabilities: {
        indexedDb: true,
      },
      userAgent: navigator.userAgent,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("player");
  });

  it("copies text and reports unavailable clipboard access", async () => {
    Reflect.deleteProperty(navigator, "clipboard");
    await expect(copyText("diagnostics")).rejects.toThrow(
      "Clipboard access is not available",
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await copyText("diagnostics");
    expect(writeText).toHaveBeenCalledWith("diagnostics");
  });

  it("propagates clipboard permission failures", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("permission denied")),
      },
    });

    await expect(copyText("diagnostics")).rejects.toThrow("permission denied");
  });
});
