import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createEmptyBoardInventory,
  type BoardDesign,
  type BoardHex,
  type BoardPort,
} from "../../domain";
import {
  buildBoardSvg,
  downloadBoardPng,
  downloadBoardSvg,
  printBoardDesign,
} from "./boardExport";

afterEach(() => {
  vi.useRealTimers();
  for (const frame of document.querySelectorAll("iframe")) {
    frame.remove();
  }
});

describe("board export markup branches", () => {
  it("marks 8 as a red token and leaves other tokens unstyled", () => {
    const svg = buildBoardSvg(
      designWith({
        name: "Token styling",
        hexes: [
          hex({ q: 0, r: 0 }, "fields", 8),
          hex({ q: 1, r: 0 }, "pasture", 5),
        ],
      }),
    );

    expect(svg).toContain('class="number number-red">8</text>');
    expect(svg).toContain('class="number">5</text>');
    expect(svg).toContain(">5 pips</text>");
    expect(svg).toContain(">4 pips</text>");
  });

  it("breaks a line before an over-long word and after a full line", () => {
    const svg = buildBoardSvg(
      designWith({
        name: `Isle ${"B".repeat(40)}`,
        hexes: [hex({ q: 0, r: 0 }, "desert", null)],
      }),
    );

    expect(tspans(svg)).toEqual([
      "Isle",
      "B".repeat(17),
      "B".repeat(17),
      "B".repeat(6),
    ]);
  });

  it("wraps on word boundaries when a line would overflow", () => {
    const svg = buildBoardSvg(
      designWith({
        name: "Northern Coastal Isles",
        hexes: [hex({ q: 0, r: 0 }, "desert", null)],
      }),
    );

    expect(tspans(svg)).toEqual(["Northern Coastal", "Isles"]);
  });

  it("falls back to a placeholder title for a blank name", () => {
    const svg = buildBoardSvg(
      designWith({
        name: "   ",
        hexes: [hex({ q: 0, r: 0 }, "desert", null)],
      }),
    );

    expect(tspans(svg)).toEqual(["Untitled island"]);
  });
});

describe("downloadBoardSvg", () => {
  it("downloads an SVG blob through a revoked object URL", async () => {
    const objectUrls = stubObjectUrls();
    const clicks = stubAnchorClicks();

    downloadBoardSvg(designWith({ name: "Forest & Coast" }));

    expect(clicks).toEqual([
      { href: "blob:board-0", download: expect.any(String) as unknown },
    ]);
    expect(clicks[0]?.download).toMatch(
      /^catan-board-\d{4}-\d{2}-\d{2}-forest-coast\.svg$/,
    );
    expect(objectUrls.revoked).toEqual(["blob:board-0"]);
    const blob = objectUrls.created[0];
    expect(blob?.type).toBe("image/svg+xml;charset=utf-8");
    await expect(blob?.text()).resolves.toContain("Forest &amp; Coast");
  });

  it("refuses to download an empty board", () => {
    const objectUrls = stubObjectUrls();

    expect(() => downloadBoardSvg(designWith({ hexes: [] }))).toThrow(
      "Place at least one hex before exporting the board.",
    );
    expect(objectUrls.created).toEqual([]);
  });
});

describe("downloadBoardPng", () => {
  it("rasterises the board at 2x and downloads a PNG", async () => {
    const objectUrls = stubObjectUrls();
    const clicks = stubAnchorClicks();
    stubImage({ width: 800, height: 600 });
    const drawImage = stubCanvasContext();
    const canvasSizes = stubToBlob(
      new Blob(["png-bytes"], { type: "image/png" }),
    );

    await downloadBoardPng(designWith({ name: "Raster island" }));

    expect(canvasSizes).toEqual([{ width: 1600, height: 1200 }]);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      0,
      0,
      1600,
      1200,
    );
    expect(clicks[0]?.download).toMatch(
      /^catan-board-\d{4}-\d{2}-\d{2}-raster-island\.png$/,
    );
    expect(objectUrls.created[1]?.type).toBe("image/png");
    // The SVG source URL and the PNG download URL are both released.
    expect(objectUrls.revoked).toEqual(["blob:board-1", "blob:board-0"]);
  });

  it("clamps very large boards to the 4096 pixel budget", async () => {
    stubObjectUrls();
    stubAnchorClicks();
    stubImage({ width: 8192, height: 4096 });
    stubCanvasContext();
    const canvasSizes = stubToBlob(
      new Blob(["png-bytes"], { type: "image/png" }),
    );

    await downloadBoardPng(designWith({ name: "Huge island" }));

    expect(canvasSizes).toEqual([{ width: 4096, height: 2048 }]);
  });

  it("reports an unrenderable board image and still releases the URL", async () => {
    const objectUrls = stubObjectUrls();
    const clicks = stubAnchorClicks();
    stubImage({ width: 800, height: 600, fail: true });

    await expect(downloadBoardPng(designWith({}))).rejects.toThrow(
      "The board image could not be rendered.",
    );
    expect(objectUrls.revoked).toEqual(["blob:board-0"]);
    expect(clicks).toEqual([]);
  });

  it("reports a missing 2d canvas context", async () => {
    const objectUrls = stubObjectUrls();
    const clicks = stubAnchorClicks();
    stubImage({ width: 800, height: 600 });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    await expect(downloadBoardPng(designWith({}))).rejects.toThrow(
      "PNG export is unavailable in this browser.",
    );
    expect(objectUrls.revoked).toEqual(["blob:board-0"]);
    expect(clicks).toEqual([]);
  });

  it("reports a canvas that produces no PNG blob", async () => {
    const objectUrls = stubObjectUrls();
    const clicks = stubAnchorClicks();
    stubImage({ width: 800, height: 600 });
    stubCanvasContext();
    stubToBlob(null);

    await expect(downloadBoardPng(designWith({}))).rejects.toThrow(
      "The board PNG could not be created.",
    );
    expect(objectUrls.revoked).toEqual(["blob:board-0"]);
    expect(clicks).toEqual([]);
  });

  it("never rasterises an empty board", async () => {
    const objectUrls = stubObjectUrls();

    await expect(downloadBoardPng(designWith({ hexes: [] }))).rejects.toThrow(
      "Place at least one hex before exporting the board.",
    );
    expect(objectUrls.created).toEqual([]);
  });
});

describe("printBoardDesign", () => {
  it("writes the board into a hidden frame, prints it, then cleans up", () => {
    vi.useFakeTimers();

    printBoardDesign(designWith({ name: "Print & Play" }));

    const frame = document.body.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.title).toBe("Print Print & Play");
    expect(frame?.style.position).toBe("fixed");
    expect(frame?.style.opacity).toBe("0");
    expect(frame?.contentDocument?.title).toBe("Print & Play");
    expect(frame?.contentDocument?.body.innerHTML).toContain("<svg");

    const frameWindow = frame?.contentWindow;
    if (!frameWindow) {
      throw new Error("The print frame has no window.");
    }
    const focus = vi
      .spyOn(frameWindow, "focus")
      .mockImplementation(() => undefined);
    const print = vi
      .spyOn(frameWindow, "print")
      .mockImplementation(() => undefined);

    vi.advanceTimersByTime(0);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.body.contains(frame)).toBe(true);

    vi.advanceTimersByTime(1_000);

    expect(document.body.contains(frame)).toBe(false);
  });

  it("removes the frame when no print document is available", () => {
    vi.spyOn(
      HTMLIFrameElement.prototype,
      "contentDocument",
      "get",
    ).mockReturnValue(null);

    expect(() => printBoardDesign(designWith({}))).toThrow(
      "Print preview could not be opened.",
    );
    expect(document.body.querySelector("iframe")).toBeNull();
  });

  it("removes the frame when the board cannot be rendered", () => {
    expect(() => printBoardDesign(designWith({ hexes: [] }))).toThrow(
      "Place at least one hex before exporting the board.",
    );
  });
});

function tspans(svg: string): string[] {
  return [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(
    ([, content]) => content ?? "",
  );
}

function hex(
  coordinate: { q: number; r: number },
  terrain: BoardHex["terrain"],
  numberToken: BoardHex["numberToken"],
): BoardHex {
  return { coordinate, terrain, numberToken };
}

function designWith(overrides: {
  name?: string;
  hexes?: BoardHex[];
  ports?: BoardPort[];
}): BoardDesign {
  const hexes = overrides.hexes ?? [hex({ q: 0, r: 0 }, "forest", null)];
  const inventory = createEmptyBoardInventory();
  for (const placed of hexes) {
    inventory.terrain[placed.terrain] += 1;
    if (placed.numberToken !== null) {
      inventory.numbers[placed.numberToken] += 1;
    }
  }
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("coverage-board"),
    revision: 0,
    name: overrides.name ?? "Coverage island",
    createdAt: asIsoTimestamp("2026-07-25T09:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-25T09:00:00.000Z"),
    inventory,
    footprint: hexes.map(({ coordinate }) => coordinate),
    hexes,
    ports: overrides.ports ?? [],
  };
}

function stubObjectUrls(): { created: Blob[]; revoked: string[] } {
  const created: Blob[] = [];
  const revoked: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((source) => {
    const url = `blob:board-${created.length}`;
    created.push(source as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
  });
  return { created, revoked };
}

function stubAnchorClicks(): { href: string; download: string }[] {
  const clicks: { href: string; download: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
  return clicks;
}

function stubImage(options: {
  width: number;
  height: number;
  fail?: boolean;
}): void {
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
    options.width,
  );
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(
    options.height,
  );
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(
    function (this: HTMLImageElement) {
      queueMicrotask(() => {
        this.dispatchEvent(new Event(options.fail === true ? "error" : "load"));
      });
    },
  );
}

function stubCanvasContext(): ReturnType<typeof vi.fn> {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  return drawImage;
}

function stubToBlob(blob: Blob | null): { width: number; height: number }[] {
  const sizes: { width: number; height: number }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    sizes.push({ width: this.width, height: this.height });
    callback(blob);
  });
  return sizes;
}
