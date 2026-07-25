import { describe, expect, it, vi } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createClassicIslandInventory,
  createEmptyBoardInventory,
  type BoardDesign,
  type BoardDesignId,
} from "../domain";
import {
  BoardDesignerController,
  persistenceError,
  type BoardDesignerSnapshot,
  type BoardDesignList,
  type BoardDesignRepository,
} from "./index";
import type { BoardDesignerRuntimeDependencies } from "./runtime";

describe("BoardDesignerController subscriptions", () => {
  it("stops notifying a listener after it unsubscribes", async () => {
    const { controller } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    await controller.initialize();
    const notificationsWhileSubscribed = listener.mock.calls.length;
    expect(notificationsWhileSubscribed).toBeGreaterThan(0);

    unsubscribe();
    controller.clearError();
    await controller.createDesign();

    expect(listener).toHaveBeenCalledTimes(notificationsWhileSubscribed);
  });
});

describe("BoardDesignerController.initialize", () => {
  it("surfaces a storage failure and stops loading", async () => {
    const { controller, repository } = setup();
    repository.initializeFailure = persistenceError(
      "STORAGE_UNAVAILABLE",
      "IndexedDB is blocked.",
    );

    await expect(controller.initialize()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });

    expect(controller.getSnapshot()).toMatchObject({
      initialized: false,
      loading: false,
      designs: [],
    });
    expect(controller.getSnapshot().error?.message).toBe(
      "IndexedDB is blocked.",
    );
  });

  it("normalizes a non-Error storage rejection", async () => {
    const { controller, repository } = setup();
    // A storage layer that breaks its contract and rejects with a plain string.
    repository.initializeFailure = "database vanished" as unknown as Error;

    await expect(controller.initialize()).rejects.toBe("database vanished");

    expect(controller.getSnapshot().error).toMatchObject({
      name: "PersistenceError",
      code: "TRANSACTION_FAILED",
      message: "An unknown board-designer error occurred.",
    });
  });

  it("pluralizes the warning when several stored designs are unreadable", async () => {
    const { controller, repository } = setup();
    repository.invalidCount = 2;

    await controller.initialize();

    expect(controller.getSnapshot().error?.message).toBe(
      "2 saved board designs could not be loaded. Valid designs remain available.",
    );
  });
});

describe("BoardDesignerController.openDesign", () => {
  it("opens a stored design and resets undo history", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const firstId = await controller.createDesign("First island");
    await controller.dispatch({ type: "design.renamed", name: "Renamed" });
    expect(controller.getSnapshot().canUndo).toBe(true);

    const stored = storedDesign({
      id: asBoardDesignId("stored-island"),
      name: "Stored island",
      updatedAt: asIsoTimestamp("2026-07-24T08:30:00.000Z"),
    });
    repository.designs.set(stored.id, stored);

    const loadingStates: boolean[] = [];
    controller.subscribe(() => {
      loadingStates.push(controller.getSnapshot().loading);
    });

    await controller.openDesign(stored.id);

    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      canUndo: false,
      canRedo: false,
      lastSavedAt: "2026-07-24T08:30:00.000Z",
      activeDesign: { id: stored.id, name: "Stored island" },
    });
    expect(loadingStates).toContain(true);
    expect(controller.getSnapshot().activeDesign?.id).not.toBe(firstId);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it("reports a missing design without changing the open design", async () => {
    const { controller } = setup();
    await controller.initialize();
    const id = await controller.createDesign("Kept open");

    await expect(
      controller.openDesign(asBoardDesignId("does-not-exist")),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The board design was not found.",
    });

    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      activeDesign: { id, name: "Kept open" },
    });
    expect(controller.getSnapshot().error?.message).toBe(
      "The board design was not found.",
    );
  });
});

describe("BoardDesignerController command failures", () => {
  it("rejects an invalid command without touching storage", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const id = await controller.createDesign("Stable name");
    const savedRevision = repository.designs.get(id)?.revision;

    await expect(
      controller.dispatch({ type: "design.renamed", name: "   " }),
    ).rejects.toMatchObject({
      name: "BoardDesignerApplicationError",
      code: "invalid-name",
    });

    expect(controller.getSnapshot()).toMatchObject({
      saving: false,
      activeDesign: { name: "Stable name" },
      canUndo: false,
    });
    expect(repository.designs.get(id)?.revision).toBe(savedRevision);
  });

  it("refuses to mutate when no design is open", async () => {
    const { controller } = setup();
    await controller.initialize();
    await controller.createDesign();
    controller.closeDesign();

    await expect(
      controller.dispatch({
        type: "hex.placed",
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No board design is open.",
    });
    await expect(controller.generate()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(controller.resizeFootprint(3, 3)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("BoardDesignerController.generate", () => {
  it("reports an empty inventory instead of generating", async () => {
    const { controller } = setup();
    await controller.initialize();
    await controller.createDesign("Empty box", createEmptyBoardInventory());

    await expect(controller.generate()).rejects.toMatchObject({
      name: "BoardDesignerApplicationError",
      code: "invalid-layout",
      message: "Add at least one terrain or sea hex first.",
    });

    expect(controller.getSnapshot().activeDesign?.hexes).toEqual([]);
    expect(controller.getSnapshot().saving).toBe(false);
  });

  it("rejects a generated layout that falls outside the stored border", async () => {
    const { controller, repository } = setup();
    const inventory = createEmptyBoardInventory();
    inventory.terrain.sea = 2;
    const stored = storedDesign({
      id: asBoardDesignId("out-of-range-border"),
      name: "Out of range border",
      inventory,
      // Persisted before border validation existed: outside the legal range.
      footprint: [
        { q: 1_000, r: 0 },
        { q: 1_001, r: 0 },
      ],
    });
    repository.designs.set(stored.id, stored);
    await controller.initialize();
    await controller.openDesign(stored.id);

    await expect(controller.generate()).rejects.toMatchObject({
      name: "BoardDesignerApplicationError",
      code: "invalid-footprint",
    });

    expect(controller.getSnapshot().activeDesign).toMatchObject({
      revision: 0,
      hexes: [],
    });
    expect(controller.getSnapshot().error?.message).toContain(
      "180-degree symmetric border",
    );
  });
});

describe("BoardDesignerController.resizeFootprint", () => {
  it("reports dimensions that cannot hold the inventory", async () => {
    const { controller } = setup();
    await controller.initialize();
    await controller.createDesign("Classic island");
    const footprintBefore = controller.getSnapshot().activeDesign?.footprint;

    await expect(controller.resizeFootprint(1, 1)).rejects.toMatchObject({
      name: "BoardDesignerApplicationError",
      code: "invalid-footprint",
    });

    expect(controller.getSnapshot().error?.message).toContain(
      "holds only 1 cells",
    );
    expect(controller.getSnapshot().activeDesign?.footprint).toEqual(
      footprintBefore,
    );
  });
});

describe("BoardDesignerController history edges", () => {
  it("ignores undo and redo when there is nothing to restore", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const id = await controller.createDesign("No history");
    const revisionBefore = repository.designs.get(id)?.revision;

    await controller.undo();
    await controller.redo();

    expect(controller.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: false,
      saving: false,
      activeDesign: { revision: 0 },
    });
    expect(repository.designs.get(id)?.revision).toBe(revisionBefore);
  });
});

describe("BoardDesignerController.deleteDesign", () => {
  it("propagates a non-conflict storage failure unchanged", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const id = await controller.createDesign("Undeletable");
    repository.failNextDelete = true;

    await expect(controller.deleteDesign(id, 0)).rejects.toThrow(
      "Delete failed",
    );

    expect(repository.designs.has(id)).toBe(true);
    expect(controller.getSnapshot().activeDesign?.id).toBe(id);
    expect(controller.getSnapshot().error?.message).toBe("Delete failed");
  });

  it("keeps the open design when a different design is deleted", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const archivedId = await controller.createDesign("Archived island");
    const openId = await controller.createDesign("Open island");
    expect(controller.getSnapshot().designs).toHaveLength(2);

    await controller.deleteDesign(archivedId, 0);

    expect(repository.designs.has(archivedId)).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      saving: false,
      activeDesign: { id: openId, name: "Open island" },
    });
    expect(controller.getSnapshot().designs).toEqual([
      expect.objectContaining({ id: openId }) as unknown,
    ]);
    expect(controller.getSnapshot().lastSavedAt).not.toBeNull();
  });

  it("reloads the newer version when a delete hits a revision conflict", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const id = await controller.createDesign("Shared island");
    await controller.dispatch({
      type: "design.renamed",
      name: "Renamed in this tab",
    });

    // The caller still believes the design sits at revision 0.
    await expect(controller.deleteDesign(id, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
      details: { designId: id, expectedRevision: 0 },
    });

    expect(repository.designs.has(id)).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: false,
      activeDesign: { id, revision: 1, name: "Renamed in this tab" },
    });
    expect(controller.getSnapshot().error?.message).toContain(
      "The latest saved version has been loaded",
    );
  });
});

describe("BoardDesignerController save conflicts", () => {
  it("clears the design when a save conflicts with a remote deletion", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const id = await controller.createDesign("Deleted elsewhere");
    repository.designs.delete(id);

    await expect(
      controller.dispatch({ type: "design.renamed", name: "Rename attempt" }),
    ).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
      details: { designId: id, expectedRevision: 0 },
    });

    expect(controller.getSnapshot()).toMatchObject({
      activeDesign: null,
      canUndo: false,
      canRedo: false,
      lastSavedAt: null,
      designs: [],
    });
    expect(controller.getSnapshot().error?.message).toBe(
      "This design was deleted in another tab.",
    );
  });
});

describe("BoardDesignerController.exportDesign", () => {
  it("reports an unknown design id", async () => {
    const { controller } = setup();
    await controller.initialize();

    await expect(
      controller.exportDesign(asBoardDesignId("never-saved")),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The board design was not found.",
    });
  });

  it("exports a design that is not currently open", async () => {
    const { controller, repository } = setup();
    await controller.initialize();
    const stored = storedDesign({
      id: asBoardDesignId("closed-island"),
      name: "Closed island",
    });
    repository.designs.set(stored.id, stored);

    const exported = await controller.exportDesign(stored.id);

    expect(exported).toMatchObject({
      applicationVersion: expect.any(String) as unknown,
      design: { id: stored.id, name: "Closed island" },
    });
    expect(controller.getSnapshot().activeDesign).toBeNull();
  });
});

describe("BoardDesignerController naming and footprint fallbacks", () => {
  it("falls back to a placeholder name for a blank title", async () => {
    const { controller } = setup();
    await controller.initialize();

    await controller.createDesign("   \n  ");

    expect(controller.getSnapshot().activeDesign?.name).toBe("Untitled island");
  });

  it("truncates an over-long name to 80 characters", async () => {
    const { controller } = setup();
    await controller.initialize();

    await controller.createDesign("N".repeat(120));

    expect(controller.getSnapshot().activeDesign?.name).toBe("N".repeat(80));
  });

  it("creates an empty border when the inventory cannot be laid out", async () => {
    const { controller } = setup();
    const oversized = createEmptyBoardInventory();
    oversized.terrain.sea = 500;
    await controller.initialize();

    await controller.createDesign("Oversized inventory", oversized);

    expect(controller.getSnapshot().activeDesign).toMatchObject({
      name: "Oversized inventory",
      footprint: [],
      hexes: [],
    });
  });
});

describe("BoardDesignerController.clearError", () => {
  it("clears a surfaced error and notifies listeners", async () => {
    const { controller } = setup();
    await controller.initialize();
    await controller.createDesign();

    await expect(
      controller.dispatch({ type: "design.renamed", name: "" }),
    ).rejects.toThrow();
    expect(controller.getSnapshot().error).not.toBeNull();

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.clearError();

    expect(controller.getSnapshot().error).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

function setup(): {
  controller: BoardDesignerController;
  repository: MemoryBoardDesignRepository;
  snapshot: () => BoardDesignerSnapshot;
} {
  const repository = new MemoryBoardDesignRepository();
  const controller = new BoardDesignerController(
    repository,
    { nextUint32: () => 0 },
    runtime(),
  );
  return { controller, repository, snapshot: controller.getSnapshot };
}

function storedDesign(overrides: Partial<BoardDesign>): BoardDesign {
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("stored-design"),
    revision: 0,
    name: "Stored design",
    createdAt: asIsoTimestamp("2026-07-24T08:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-24T08:00:00.000Z"),
    inventory: createClassicIslandInventory(),
    footprint: [],
    hexes: [],
    ports: [],
    ...overrides,
  };
}

class MemoryBoardDesignRepository implements BoardDesignRepository {
  readonly designs = new Map<BoardDesignId, BoardDesign>();
  initializeFailure: Error | undefined = undefined;
  failNextList = false;
  failNextDelete = false;
  invalidCount = 0;

  initialize(): Promise<void> {
    if (this.initializeFailure !== undefined) {
      const failure = this.initializeFailure;
      this.initializeFailure = undefined;
      return Promise.reject(failure);
    }
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
    if (this.failNextDelete) {
      this.failNextDelete = false;
      return Promise.reject(new Error("Delete failed"));
    }
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
      return asBoardDesignId(`coverage-board-${id}`);
    },
    now() {
      timestamp += 1;
      return asIsoTimestamp(
        `2026-07-25T00:00:${String(timestamp).padStart(2, "0")}.000Z`,
      );
    },
  };
}
