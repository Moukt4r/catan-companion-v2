import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadJson, makeBackupFilename, readJsonFile } from "./files";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("file helpers", () => {
  it("creates a stable filesystem-safe backup name", () => {
    const date = new Date("2026-07-12T12:00:00.000Z");

    expect(makeBackupFilename("Sunday Game!", date)).toBe(
      "catan-companion-2026-07-12-sunday-game.json",
    );
  });

  it("parses a JSON backup file", async () => {
    const file = new File(['{"format":"catan-table-companion"}'], "game.json", {
      type: "application/json",
    });

    await expect(readJsonFile(file)).resolves.toEqual({
      format: "catan-table-companion",
    });
  });

  it("rejects oversized backups before parsing", async () => {
    const file = new File(["12345"], "large.json");

    await expect(readJsonFile(file, 4)).rejects.toThrow("larger than 10 MB");
  });

  it("propagates malformed JSON failures", async () => {
    const file = new File(["not json"], "broken.json");

    await expect(readJsonFile(file)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("downloads JSON through a temporary object URL", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadJson({ game: "test" }, "backup.json");

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchor).toMatchObject({
      href: "blob:test",
      download: "backup.json",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("falls back to game and truncates long filename slugs", () => {
    const date = new Date("2026-07-12T12:00:00.000Z");

    expect(makeBackupFilename(" !!! ", date)).toBe(
      "catan-companion-2026-07-12-game.json",
    );
    expect(makeBackupFilename("A".repeat(100), date)).toBe(
      `catan-companion-2026-07-12-${"a".repeat(48)}.json`,
    );
  });
});
