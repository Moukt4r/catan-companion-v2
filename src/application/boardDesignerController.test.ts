import { describe, expect, it, vi } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createEmptyBoardInventory,
  footprintDimensions,
  isSymmetricFootprint,
  type BoardDesign,
  type BoardDesignId,
} from "../domain";
import {
  BOARD_DESIGN_EXPORT_FORMAT,
  BoardDesignerController,
  persistenceError,
  type BoardDesignList,
  type BoardDesignRepository,
} from "./index";
import type { BoardDesignerRuntimeDependencies } from "./runtime";

describe("BoardDesignerController", () => {
  it("creates, saves, edits, and navigates board history", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    const listener = vi.fn();
    controller.subscribe(listener);

    await controller.initialize();
    await controller.createDesign("Custom coast");
    await controller.dispatch({
      type: "hex.placed",
      coordinate: { q: 0, r: 0 },
      terrain: "forest",
    });

    expect(controller.getSnapshot()).toMatchObject({
      initialized: true,
      saving: false,
      canUndo: true,
      canRedo: false,
      activeDesign: {
        name: "Custom coast",
        hexes: [{ terrain: "forest" }],
      },
    });

    await controller.undo();
    expect(controller.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
      activeDesign: { hexes: [] },
    });

    await controller.redo();
    expect(controller.getSnapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      activeDesign: { hexes: [{ terrain: "forest" }] },
    });
    expect(listener).toHaveBeenCalled();
  });

  it("generates, duplicates, exports, imports, and deletes designs", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    const originalId = await controller.createDesign("Generated island");
    await controller.generate();

    expect(controller.getSnapshot().activeDesign?.hexes).toHaveLength(37);

    const copyId = await controller.duplicateDesign(originalId);
    expect(copyId).not.toBe(originalId);
    expect(controller.getSnapshot().activeDesign?.name).toBe(
      "Generated island copy",
    );

    const exported = await controller.exportDesign(copyId);
    expect(exported).toMatchObject({
      format: BOARD_DESIGN_EXPORT_FORMAT,
      design: { id: copyId },
    });

    const importedId = await controller.importDesign(exported.design);
    expect(importedId).not.toBe(copyId);
    expect(controller.getSnapshot().activeDesign?.name).toBe(
      "Generated island copy imported",
    );

    await controller.deleteDesign(importedId, 0);
    expect(controller.getSnapshot().activeDesign).toBeNull();
    expect(controller.getSnapshot().designs).toHaveLength(2);
  });

  it("does not publish an edit when persistence fails", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    await controller.createDesign();
    repository.failNextSave = true;

    await expect(
      controller.dispatch({
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    ).rejects.toThrow("Save failed");

    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: { hexes: [] },
      canUndo: false,
    });

    expect(controller.getSnapshot().error?.message).toBe("Save failed");
  });

  it("creates an undoable symmetric border from dimensions", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    await controller.createDesign("Border", createEmptyBoardInventory());
    await controller.dispatch({
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 3,
    });
    await controller.dispatch({
      type: "inventory.countSet",
      category: "terrain",
      item: "sea",
      count: 2,
    });

    await controller.resizeFootprint(5, 1);

    expect(controller.getSnapshot().activeDesign?.footprint).toHaveLength(5);
    expect(
      isSymmetricFootprint(
        controller.getSnapshot().activeDesign?.footprint ?? [],
      ),
    ).toBe(true);
    await controller.undo();
    expect(controller.getSnapshot().activeDesign?.footprint).toEqual([]);
  });

  it("resizes the fixed-count border to exact dimensions", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    await controller.createDesign();

    await controller.resizeFootprint(9, 5);

    const resized = controller.getSnapshot().activeDesign;
    expect(resized?.footprint).toHaveLength(37);
    expect(footprintDimensions(resized?.footprint ?? [])).toEqual({
      width: 9,
      height: 5,
    });
    await controller.undo();
    expect(
      footprintDimensions(
        controller.getSnapshot().activeDesign?.footprint ?? [],
      ),
    ).toEqual({ width: 7, height: 7 });
  });

  it("loads the latest design instead of overwriting another tab", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    const id = await controller.createDesign();
    const original = repository.designs.get(id);
    if (!original) {
      throw new Error("Created design was not stored.");
    }
    const external: BoardDesign = {
      ...structuredClone(original),
      revision: 1,
      name: "Changed elsewhere",
    };
    repository.designs.set(id, external);

    await expect(
      controller.dispatch({
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });

    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: {
        revision: 1,
        name: "Changed elsewhere",
        hexes: [],
      },
      canUndo: false,
      canRedo: false,
    });
  });

  it("discards mutations queued before a revision conflict", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    const id = await controller.createDesign();
    const original = repository.designs.get(id);
    if (!original) {
      throw new Error("Created design was not stored.");
    }
    repository.designs.set(id, {
      ...structuredClone(original),
      revision: 1,
      inventory: {
        ...structuredClone(original.inventory),
        terrain: {
          ...original.inventory.terrain,
          forest: 5,
        },
      },
    });

    const first = controller.dispatch({
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 1,
    });
    const second = controller.dispatch({
      type: "inventory.countSet",
      category: "terrain",
      item: "forest",
      count: 2,
    });

    await expect(first).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    await expect(second).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    expect(repository.designs.get(id)).toMatchObject({
      revision: 1,
      inventory: { terrain: { forest: 5 } },
    });
    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: {
        revision: 1,
        inventory: { terrain: { forest: 5 } },
      },
    });
    expect(controller.getSnapshot().error?.message).toContain(
      "changed in another tab",
    );
  });

  it("publishes durable edits even if the library refresh fails", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    await controller.createDesign();
    repository.failNextList = true;

    await controller.dispatch({
      type: "hex.placed",
      coordinate: { q: 0, r: 0 },
      terrain: "forest",
    });

    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: {
        revision: 1,
        hexes: [{ terrain: "forest" }],
      },
      canUndo: true,
    });
    expect(controller.getSnapshot().error?.message).toBe(
      "The design was saved, but the library could not refresh.",
    );
  });

  it("removes a stale library summary after a conflicted delete", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    const id = await controller.createDesign();
    controller.closeDesign();
    repository.designs.delete(id);

    await expect(controller.deleteDesign(id, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });

    expect(controller.getSnapshot().designs).toEqual([]);
    expect(controller.getSnapshot().error?.message).toContain(
      "deleted in another tab",
    );
  });

  it("clears an active design and history after a conflicted remote deletion", async () => {
    const repository = new MemoryBoardDesignRepository();
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    await controller.initialize();
    const id = await controller.createDesign();
    await controller.dispatch({
      type: "design.renamed",
      name: "Edited locally",
    });
    repository.designs.delete(id);

    await expect(controller.deleteDesign(id, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });

    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: null,
      canUndo: false,
      canRedo: false,
      lastSavedAt: null,
    });
    expect(controller.getSnapshot().error?.message).toContain(
      "deleted in another tab",
    );
  });

  it("keeps valid summaries visible when another stored design is invalid", async () => {
    const repository = new MemoryBoardDesignRepository();
    repository.invalidCount = 1;
    const controller = new BoardDesignerController(
      repository,
      { nextUint32: () => 0 },
      runtime(),
    );
    const stored: BoardDesign = {
      documentVersion: BOARD_DOCUMENT_VERSION,
      id: asBoardDesignId("valid-summary"),
      revision: 0,
      name: "Valid summary",
      createdAt: asIsoTimestamp("2026-07-23T00:00:00.000Z"),
      updatedAt: asIsoTimestamp("2026-07-23T00:00:00.000Z"),
      inventory: createEmptyBoardInventory(),
      footprint: [],
      hexes: [],
      ports: [],
    };
    repository.designs.set(stored.id, stored);

    await controller.initialize();

    expect(controller.getSnapshot().designs).toHaveLength(1);
    expect(controller.getSnapshot().error?.message).toContain(
      "1 saved board design could not be loaded",
    );
  });
});

class MemoryBoardDesignRepository implements BoardDesignRepository {
  readonly designs = new Map<BoardDesignId, BoardDesign>();
  failNextSave = false;
  failNextList = false;
  invalidCount = 0;

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  listDesigns(): Promise<BoardDesignList> {
    if (this.failNextList) {
      this.failNextList = false;
      return Promise.reject(new Error("List failed"));
    }
    return Promise.resolve({
      designs: [...this.designs.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
      invalidCount: this.invalidCount,
    });
  }

  loadDesign(id: BoardDesignId): Promise<BoardDesign | null> {
    return Promise.resolve(this.designs.get(id) ?? null);
  }

  saveDesign(
    design: BoardDesign,
    expectedRevision: number | null,
  ): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error("Save failed"));
    }
    const current = this.designs.get(design.id);
    const matchesExpectation =
      expectedRevision === null
        ? current === undefined && design.revision === 0
        : current?.revision === expectedRevision &&
          design.revision === expectedRevision + 1;
    if (!matchesExpectation) {
      return Promise.reject(
        persistenceError(
          "REVISION_CONFLICT",
          "The board design changed in another tab.",
        ),
      );
    }
    this.designs.set(design.id, structuredClone(design));
    return Promise.resolve();
  }

  deleteDesign(id: BoardDesignId, expectedRevision: number): Promise<void> {
    if (this.designs.get(id)?.revision !== expectedRevision) {
      return Promise.reject(
        persistenceError(
          "REVISION_CONFLICT",
          "The board design changed in another tab.",
        ),
      );
    }
    this.designs.delete(id);
    return Promise.resolve();
  }
}

function runtime(): BoardDesignerRuntimeDependencies {
  let id = 0;
  let timestamp = 0;
  return {
    boardDesignId() {
      id += 1;
      return asBoardDesignId(`board-${id}`);
    },
    now() {
      timestamp += 1;
      return asIsoTimestamp(
        `2026-07-23T00:00:${String(timestamp).padStart(2, "0")}.000Z`,
      );
    },
  };
}
