import { describe, expect, it } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createEmptyBoardInventory,
  type BoardDesign,
} from "../../domain";
import { buildBoardSvg } from "./boardExport";

describe("board export", () => {
  it("renders terrain, number tokens, ports, and escaped titles", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.gold = 1;
    inventory.terrain.sea = 1;
    inventory.numbers[6] = 1;
    inventory.ports.forest = 1;
    const design: BoardDesign = {
      documentVersion: BOARD_DOCUMENT_VERSION,
      id: asBoardDesignId("export-board"),
      revision: 0,
      name: "Forest & Coast",
      createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      inventory,
      footprint: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "gold",
          numberToken: 6,
        },
        {
          coordinate: { q: 1, r: 0 },
          terrain: "sea",
          numberToken: null,
        },
      ],
      ports: [
        {
          landCoordinate: { q: 0, r: 0 },
          direction: 0,
          type: "forest",
        },
      ],
    };

    const svg = buildBoardSvg(design);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Forest &amp; Coast");
    expect(svg).toContain("Gold Field");
    expect(svg).toContain(">6</text>");
    expect(svg).toContain("Forest 2:1");
  });

  it("rejects empty board exports", () => {
    const design: BoardDesign = {
      documentVersion: BOARD_DOCUMENT_VERSION,
      id: asBoardDesignId("empty-export"),
      revision: 0,
      name: "Empty",
      createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      inventory: createEmptyBoardInventory(),
      footprint: [],
      hexes: [],
      ports: [],
    };

    expect(() => buildBoardSvg(design)).toThrow("Place at least one hex");
  });

  it("wraps long titles inside an expanded export view box", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.desert = 1;
    const design: BoardDesign = {
      documentVersion: BOARD_DOCUMENT_VERSION,
      id: asBoardDesignId("long-title-export"),
      revision: 0,
      name: "A".repeat(80),
      createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      inventory,
      footprint: [{ q: 0, r: 0 }],
      hexes: [
        {
          coordinate: { q: 0, r: 0 },
          terrain: "desert",
          numberToken: null,
        },
      ],
      ports: [],
    };

    const svg = buildBoardSvg(design);

    expect(svg.match(/<tspan/g)).toHaveLength(5);
    expect(svg).toContain('width="640"');
  });

  it("uses dark accessible fills for white-labelled terrain", () => {
    const inventory = createEmptyBoardInventory();
    inventory.terrain.hills = 1;
    inventory.terrain.mountains = 1;
    inventory.terrain.sea = 1;
    const design: BoardDesign = {
      documentVersion: BOARD_DOCUMENT_VERSION,
      id: asBoardDesignId("contrast-export"),
      revision: 0,
      name: "Contrast",
      createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
      inventory,
      footprint: [
        { q: -1, r: 0 },
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      hexes: [
        {
          coordinate: { q: -1, r: 0 },
          terrain: "hills",
          numberToken: null,
        },
        {
          coordinate: { q: 0, r: 0 },
          terrain: "mountains",
          numberToken: null,
        },
        {
          coordinate: { q: 1, r: 0 },
          terrain: "sea",
          numberToken: null,
        },
      ],
      ports: [],
    };

    const svg = buildBoardSvg(design);

    expect(svg).toContain('fill="#8f472f"');
    expect(svg).toContain('fill="#596565"');
    expect(svg).toContain('fill="#2f6f88"');
  });
});
