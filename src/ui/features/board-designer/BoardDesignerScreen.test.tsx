import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createClassicIslandInventory,
  createSymmetricFootprint,
  symmetricRemovalPairs,
  type BoardCommand,
  type BoardDesign,
} from "../../../domain";
import { BoardDesignerScreen } from "./BoardDesignerScreen";

describe("BoardDesignerScreen", () => {
  it("places a selected terrain tile on the manual grid", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    renderScreen({ onCommand });

    await user.click(screen.getByRole("button", { name: /forest, 5 left/i }));
    await user.click(
      screen.getByRole("button", {
        name: "Empty border cell q 0, r 0",
      }),
    );

    expect(onCommand).toHaveBeenCalledWith({
      type: "hex.placed",
      coordinate: { q: 0, r: 0 },
      terrain: "forest",
    });
  });

  it("updates inventory and generates a complete layout", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onGenerate = vi.fn(() => Promise.resolve());
    renderScreen({ onCommand, onGenerate });

    await user.click(
      screen.getByRole("button", { name: "Increase Gold Field" }),
    );
    await user.click(screen.getByRole("button", { name: "Increase Sea" }));
    await user.click(screen.getByRole("button", { name: "Generate board" }));

    expect(onCommand).toHaveBeenCalledWith({
      type: "inventory.countSet",
      category: "terrain",
      item: "gold",
      count: 3,
    });
    expect(onCommand).toHaveBeenCalledWith({
      type: "inventory.countSet",
      category: "terrain",
      item: "sea",
      count: 11,
    });
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("resizes and adjusts the border with mirrored pairs", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onResizeFootprint = vi.fn(() => Promise.resolve());
    const design = fixture();
    const removable = symmetricRemovalPairs(design.footprint)[0];
    if (!removable) {
      throw new Error("Expected a removable border pair.");
    }
    renderScreen({ design, onCommand, onResizeFootprint });
    expect(
      screen.queryByRole("button", { name: /drag/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add mirrored pair" }));
    await user.click(
      screen.getAllByRole("button", {
        name: /Add mirrored border pair at q/,
      })[0]!,
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "footprint.pairAdded" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Remove mirrored pair" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(
          `Empty border cell q ${removable.first.q}, r ${removable.first.r}`,
        ),
      }),
    );
    expect(onCommand).toHaveBeenCalledWith({
      type: "footprint.pairRemoved",
      coordinate: removable.first,
    });

    const width = screen.getByRole("spinbutton", { name: "Width" });
    const height = screen.getByRole("spinbutton", { name: "Height" });
    await user.clear(width);
    await user.type(width, "9");
    await user.clear(height);
    await user.type(height, "5");
    await user.click(
      screen.getByRole("button", { name: "Apply width × height" }),
    );
    expect(onResizeFootprint).toHaveBeenCalledWith(9, 5);
  });

  it("keeps rapid inventory changes instead of reusing a stale value", async () => {
    const user = userEvent.setup();
    const pending: Array<() => void> = [];
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const design = fixture();
    design.inventory.terrain.forest = 0;
    renderScreen({ design, onCommand });

    const increase = screen.getByRole("button", {
      name: "Increase Forest",
    });
    await user.click(increase);
    await user.click(increase);

    expect(onCommand).toHaveBeenNthCalledWith(1, {
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 1,
    });
    expect(onCommand).toHaveBeenNthCalledWith(2, {
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 2,
    });
    expect(pending).toHaveLength(2);
  });

  it("preserves multi-digit inventory entry while saves are queued", async () => {
    const user = userEvent.setup();
    const pending: Array<() => void> = [];
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const design = fixture();
    design.inventory.terrain.forest = 0;
    renderScreen({ design, onCommand });

    const input = screen.getByRole("spinbutton", { name: "Forest" });
    await user.clear(input);
    await user.type(input, "12");

    expect(onCommand).toHaveBeenLastCalledWith({
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 12,
    });
    expect(pending.length).toBeGreaterThan(1);
  });

  it("marks name edits dirty until the debounced save completes", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    renderScreen({ onCommand });

    const name = screen.getByRole("textbox", { name: "Design name" });
    await user.clear(name);
    await user.type(name, "New coast");

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await waitFor(() => {
      expect(onCommand).toHaveBeenCalledWith({
        type: "design.renamed",
        name: "New coast",
      });
    });
  });

  it("preserves newer rename text while an earlier rename is saving", async () => {
    const user = userEvent.setup();
    const pending: Array<() => void> = [];
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          pending.push(resolve);
        }),
    );
    const initial = fixture();
    const props: React.ComponentProps<typeof BoardDesignerScreen> = {
      design: initial,
      saving: false,
      error: null,
      canUndo: false,
      canRedo: false,
      onBack: vi.fn(),
      onCommand,
      onResizeFootprint: () => Promise.resolve(),
      onGenerate: () => Promise.resolve(),
      onUndo: () => Promise.resolve(),
      onRedo: () => Promise.resolve(),
      onExport: vi.fn(),
    };
    const rendered = render(<BoardDesignerScreen {...props} />);
    const input = screen.getByRole("textbox", { name: "Design name" });
    await user.clear(input);
    await user.type(input, "First");
    await waitFor(() => {
      expect(onCommand).toHaveBeenCalledWith({
        type: "design.renamed",
        name: "First",
      });
    });

    await user.type(input, " second");
    await act(async () => {
      pending[0]?.();
      await Promise.resolve();
    });
    rendered.rerender(
      <BoardDesignerScreen
        {...props}
        design={{ ...initial, revision: 1, name: "First" }}
      />,
    );

    expect(input).toHaveValue("First second");
    await waitFor(() => {
      expect(onCommand).toHaveBeenLastCalledWith({
        type: "design.renamed",
        name: "First second",
      });
    });
  });

  it("does not reapply a persisted rename after undo", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const onUndo = vi.fn(() => Promise.resolve());
    const initial = fixture();
    const props: React.ComponentProps<typeof BoardDesignerScreen> = {
      design: initial,
      saving: false,
      error: null,
      canUndo: false,
      canRedo: false,
      onBack: vi.fn(),
      onCommand,
      onResizeFootprint: () => Promise.resolve(),
      onGenerate: () => Promise.resolve(),
      onUndo,
      onRedo: () => Promise.resolve(),
      onExport: vi.fn(),
    };
    const rendered = render(<BoardDesignerScreen {...props} />);
    const input = screen.getByRole("textbox", { name: "Design name" });
    await user.clear(input);
    await user.type(input, "Renamed");
    await waitFor(() => {
      expect(onCommand).toHaveBeenCalledTimes(1);
    });

    rendered.rerender(
      <BoardDesignerScreen
        {...props}
        design={{ ...initial, revision: 1, name: "Renamed" }}
        canUndo
      />,
    );
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    rendered.rerender(
      <BoardDesignerScreen
        {...props}
        design={{ ...initial, revision: 2 }}
        canRedo
      />,
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    });

    expect(input).toHaveValue(initial.name);
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it("offers non-canvas controls for terrain, tokens, movement, and ports", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn<(command: BoardCommand) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const design = fixture();
    design.hexes = [
      {
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
        numberToken: 6,
      },
      {
        coordinate: { q: 1, r: 0 },
        terrain: "sea",
        numberToken: null,
      },
    ];
    renderScreen({ design, onCommand });

    // Land tiles are drawn face down by default, the way they sit on the
    // table. Reveal them before editing terrain.
    await user.click(screen.getByRole("button", { name: "Reveal terrain" }));
    await user.click(
      screen.getByRole("button", {
        name: /forest hex at q 0, r 0, number 6/i,
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Terrain" }),
      "pasture",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "East edge" }),
      "forest",
    );

    expect(onCommand).toHaveBeenCalledWith({
      type: "hex.terrainChanged",
      coordinate: { q: 0, r: 0 },
      terrain: "pasture",
    });
    expect(onCommand).toHaveBeenCalledWith({
      type: "port.set",
      landCoordinate: { q: 0, r: 0 },
      direction: 0,
      portType: "forest",
    });
    expect(
      screen.getByRole("group", { name: "Move one grid space" }),
    ).toBeInTheDocument();
  });
});

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof BoardDesignerScreen>> = {},
) {
  const props: React.ComponentProps<typeof BoardDesignerScreen> = {
    design: fixture(),
    saving: false,
    error: null,
    canUndo: false,
    canRedo: false,
    onBack: vi.fn(),
    onCommand: () => Promise.resolve(),
    onResizeFootprint: () => Promise.resolve(),
    onGenerate: () => Promise.resolve(),
    onUndo: () => Promise.resolve(),
    onRedo: () => Promise.resolve(),
    onExport: vi.fn(),
    ...overrides,
  };
  return render(<BoardDesignerScreen {...props} />);
}

function fixture(): BoardDesign {
  const inventory = createClassicIslandInventory();
  const footprint = createSymmetricFootprint(37);
  if (!footprint.ok) {
    throw new Error(footprint.error.message);
  }
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("ui-board"),
    revision: 0,
    name: "UI island",
    createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    inventory,
    footprint: footprint.value,
    hexes: [],
    ports: [],
  };
}
