import {
  BOARD_DOCUMENT_VERSION,
  applyBoardCommand,
  createClassicIslandInventory,
  CLASSIC_BOARD_FOOTPRINT,
  createSymmetricFootprint,
  createSymmetricFootprintWithDimensions,
  generateBoardLayout,
  totalTerrain,
  validateBoardDesign,
} from "../domain";
import type {
  BoardCommand,
  BoardDesign,
  BoardDesignId,
  BoardDesignSummary,
  BoardInventory,
  BoardMutationErrorCode,
  RandomSource,
} from "../domain";
import { APPLICATION_VERSION } from "./persistence";
import {
  BOARD_DESIGN_EXPORT_FORMAT,
  BOARD_DESIGN_EXPORT_VERSION,
  type BoardDesignExportDocument,
  type BoardDesignRepository,
} from "./boardDesigns";
import {
  PersistenceError,
  isPersistenceError,
  persistenceError,
} from "./errors";
import type { BoardDesignerRuntimeDependencies } from "./runtime";

export interface BoardDesignerSnapshot {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: Error | null;
  designs: BoardDesignSummary[];
  activeDesign: BoardDesign | null;
  canUndo: boolean;
  canRedo: boolean;
  lastSavedAt: string | null;
}

const HISTORY_LIMIT = 100;

export class BoardDesignerController {
  private snapshot: BoardDesignerSnapshot = {
    initialized: false,
    loading: false,
    saving: false,
    error: null,
    designs: [],
    activeDesign: null,
    canUndo: false,
    canRedo: false,
    lastSavedAt: null,
  };
  private readonly listeners = new Set<() => void>();
  private mutationTail: Promise<void> = Promise.resolve();
  private mutationEpoch = 0;
  private past: BoardDesign[] = [];
  private future: BoardDesign[] = [];

  constructor(
    private readonly repository: BoardDesignRepository,
    private readonly random: RandomSource,
    private readonly runtime: BoardDesignerRuntimeDependencies,
  ) {}

  getSnapshot = (): BoardDesignerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    await this.enqueue(async () => {
      this.patch({ loading: true, error: null });
      try {
        await this.repository.initialize();
        const library = await this.listSummaries();
        this.patch({
          designs: library.summaries,
          error: invalidDesignWarning(library.invalidCount),
          initialized: true,
        });
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  async createDesign(
    name = "Untitled island",
    inventory: BoardInventory = createClassicIslandInventory(),
  ): Promise<BoardDesignId> {
    return this.mutate(async () => {
      const now = this.runtime.now();
      // The default inventory belongs to the table's own board, so use its
      // real outline. Any other inventory still gets a generated shape.
      const tiles = totalTerrain(inventory);
      const footprint =
        tiles === CLASSIC_BOARD_FOOTPRINT.length
          ? { ok: true as const, value: [...CLASSIC_BOARD_FOOTPRINT] }
          : createSymmetricFootprint(tiles);
      const design: BoardDesign = {
        documentVersion: BOARD_DOCUMENT_VERSION,
        id: this.runtime.boardDesignId(),
        revision: 0,
        name: normalizeName(name),
        createdAt: now,
        updatedAt: now,
        inventory: cloneInventory(inventory),
        footprint: footprint.ok ? footprint.value : [],
        hexes: [],
        ports: [],
      };
      await this.repository.saveDesign(design, null);
      this.past = [];
      this.future = [];
      await this.publishSaved(design);
      return design.id;
    });
  }

  async openDesign(id: BoardDesignId): Promise<void> {
    await this.enqueue(async () => {
      this.patch({ loading: true, error: null });
      try {
        const design = await this.repository.loadDesign(id);
        if (design === null) {
          throw persistenceError(
            "NOT_FOUND",
            "The board design was not found.",
          );
        }
        this.past = [];
        this.future = [];
        this.patch({
          activeDesign: design,
          canUndo: false,
          canRedo: false,
          lastSavedAt: design.updatedAt,
        });
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  closeDesign(): void {
    this.past = [];
    this.future = [];
    this.patch({
      activeDesign: null,
      canUndo: false,
      canRedo: false,
      lastSavedAt: null,
      error: null,
    });
  }

  dispatch = async (command: BoardCommand): Promise<void> => {
    await this.mutate(async () => {
      const current = this.requireActiveDesign();
      const result = applyBoardCommand(current, command);
      if (!result.ok) {
        throw new BoardDesignerApplicationError(
          result.error.code,
          result.error.message,
        );
      }
      await this.commit(result.value, true);
    });
  };

  async generate(): Promise<void> {
    await this.mutate(async () => {
      const current = this.requireActiveDesign();
      const generated = generateBoardLayout(
        current.inventory,
        this.random,
        current.footprint,
      );
      if (!generated.ok) {
        throw new BoardDesignerApplicationError(
          generated.error.code,
          generated.error.message,
        );
      }
      const result = applyBoardCommand(current, {
        type: "layout.replaced",
        layout: generated.value,
      });
      if (!result.ok) {
        throw new BoardDesignerApplicationError(
          result.error.code,
          result.error.message,
        );
      }
      await this.commit(result.value, true);
    });
  }

  async resizeFootprint(width: number, height: number): Promise<void> {
    await this.mutate(async () => {
      const current = this.requireActiveDesign();
      const generated = createSymmetricFootprintWithDimensions(
        totalTerrain(current.inventory),
        width,
        height,
      );
      if (!generated.ok) {
        throw new BoardDesignerApplicationError(
          generated.error.code,
          generated.error.message,
        );
      }
      const result = applyBoardCommand(current, {
        type: "footprint.replaced",
        coordinates: generated.value,
      });
      if (!result.ok) {
        throw new BoardDesignerApplicationError(
          result.error.code,
          result.error.message,
        );
      }
      await this.commit(result.value, true);
    });
  }

  async undo(): Promise<void> {
    await this.mutate(async () => {
      const previous = this.past.at(-1);
      if (!previous) {
        return;
      }
      const current = this.requireActiveDesign();
      const restored = {
        ...cloneDesign(previous),
        revision: current.revision + 1,
        updatedAt: this.runtime.now(),
      };
      await this.saveUpdatedDesign(restored, current);
      this.past = this.past.slice(0, -1);
      this.future = [...this.future, current].slice(-HISTORY_LIMIT);
      await this.publishSaved(restored);
    });
  }

  async redo(): Promise<void> {
    await this.mutate(async () => {
      const next = this.future.at(-1);
      if (!next) {
        return;
      }
      const current = this.requireActiveDesign();
      const restored = {
        ...cloneDesign(next),
        revision: current.revision + 1,
        updatedAt: this.runtime.now(),
      };
      await this.saveUpdatedDesign(restored, current);
      this.future = this.future.slice(0, -1);
      this.past = [...this.past, current].slice(-HISTORY_LIMIT);
      await this.publishSaved(restored);
    });
  }

  async duplicateDesign(id: BoardDesignId): Promise<BoardDesignId> {
    return this.mutate(async () => {
      const source = await this.requireDesign(id);
      const now = this.runtime.now();
      const duplicate: BoardDesign = {
        ...cloneDesign(source),
        id: this.runtime.boardDesignId(),
        revision: 0,
        name: normalizeName(`${source.name} copy`),
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.saveDesign(duplicate, null);
      this.past = [];
      this.future = [];
      await this.publishSaved(duplicate);
      return duplicate.id;
    });
  }

  async importDesign(source: BoardDesign): Promise<BoardDesignId> {
    return this.mutate(async () => {
      const now = this.runtime.now();
      const imported: BoardDesign = {
        ...cloneDesign(source),
        id: this.runtime.boardDesignId(),
        revision: 0,
        name: normalizeName(`${source.name} imported`),
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.saveDesign(imported, null);
      this.past = [];
      this.future = [];
      await this.publishSaved(imported);
      return imported.id;
    });
  }

  async deleteDesign(
    id: BoardDesignId,
    expectedRevision: number,
  ): Promise<void> {
    await this.mutate(async () => {
      try {
        await this.repository.deleteDesign(id, expectedRevision);
      } catch (error) {
        if (!isPersistenceError(error) || error.code !== "REVISION_CONFLICT") {
          throw error;
        }
        this.mutationEpoch += 1;
        const latest = await this.repository.loadDesign(id);
        if (this.snapshot.activeDesign?.id === id) {
          this.past = [];
          this.future = [];
          this.patch({
            activeDesign: latest,
            canUndo: false,
            canRedo: false,
            lastSavedAt: latest?.updatedAt ?? null,
          });
        }
        await this.refreshSummariesAfterDurableChange();
        throw persistenceError(
          "REVISION_CONFLICT",
          latest
            ? "This design changed in another tab. The latest saved version has been loaded."
            : "This design was deleted in another tab.",
          { designId: id, expectedRevision },
          error,
        );
      }
      if (this.snapshot.activeDesign?.id === id) {
        this.past = [];
        this.future = [];
        this.patch({
          activeDesign: null,
          canUndo: false,
          canRedo: false,
          lastSavedAt: null,
        });
      }
      await this.refreshSummariesAfterDurableChange();
    });
  }

  async exportDesign(id: BoardDesignId): Promise<BoardDesignExportDocument> {
    return this.enqueue(async () => {
      const design = await this.requireDesign(id);
      return {
        format: BOARD_DESIGN_EXPORT_FORMAT,
        exportVersion: BOARD_DESIGN_EXPORT_VERSION,
        exportedAt: this.runtime.now(),
        applicationVersion: APPLICATION_VERSION,
        design,
      };
    });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  private async commit(
    candidate: BoardDesign,
    recordHistory: boolean,
  ): Promise<void> {
    const current = this.requireActiveDesign();
    const next = {
      ...cloneDesign(candidate),
      createdAt: current.createdAt,
      revision: current.revision + 1,
      updatedAt: this.runtime.now(),
    };
    await this.saveUpdatedDesign(next, current);
    if (recordHistory) {
      this.past = [...this.past, current].slice(-HISTORY_LIMIT);
      this.future = [];
    }
    await this.publishSaved(next);
  }

  private async publishSaved(design: BoardDesign): Promise<void> {
    this.patch({
      activeDesign: design,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      lastSavedAt: design.updatedAt,
    });
    await this.refreshSummariesAfterDurableChange();
  }

  private async saveUpdatedDesign(
    next: BoardDesign,
    current: BoardDesign,
  ): Promise<void> {
    try {
      await this.repository.saveDesign(next, current.revision);
    } catch (error) {
      if (!isPersistenceError(error) || error.code !== "REVISION_CONFLICT") {
        throw error;
      }
      this.mutationEpoch += 1;
      const latest = await this.repository.loadDesign(current.id);
      this.past = [];
      this.future = [];
      this.patch({
        activeDesign: latest,
        canUndo: false,
        canRedo: false,
        lastSavedAt: latest?.updatedAt ?? null,
      });
      await this.refreshSummariesAfterDurableChange();
      throw persistenceError(
        "REVISION_CONFLICT",
        latest
          ? "This design changed in another tab. The latest saved version has been loaded."
          : "This design was deleted in another tab.",
        {
          designId: current.id,
          expectedRevision: current.revision,
        },
        error,
      );
    }
  }

  private async refreshSummariesAfterDurableChange(): Promise<void> {
    try {
      const library = await this.listSummaries();
      this.patch({
        designs: library.summaries,
        error: invalidDesignWarning(library.invalidCount),
      });
    } catch (error) {
      this.patch({
        error: persistenceError(
          "TRANSACTION_FAILED",
          "The design was saved, but the library could not refresh.",
          {},
          error,
        ),
      });
    }
  }

  private async requireDesign(id: BoardDesignId): Promise<BoardDesign> {
    if (this.snapshot.activeDesign?.id === id) {
      return this.snapshot.activeDesign;
    }
    const design = await this.repository.loadDesign(id);
    if (design === null) {
      throw persistenceError("NOT_FOUND", "The board design was not found.");
    }
    return design;
  }

  private requireActiveDesign(): BoardDesign {
    if (this.snapshot.activeDesign === null) {
      throw persistenceError("NOT_FOUND", "No board design is open.");
    }
    return this.snapshot.activeDesign;
  }

  private async listSummaries(): Promise<{
    summaries: BoardDesignSummary[];
    invalidCount: number;
  }> {
    const library = await this.repository.listDesigns();
    return {
      summaries: library.designs.map((design) => ({
        id: design.id,
        revision: design.revision,
        name: design.name,
        updatedAt: design.updatedAt,
        hexCount: design.hexes.length,
        issueCount: validateBoardDesign(design).filter(
          ({ severity }) => severity !== "info",
        ).length,
      })),
      invalidCount: library.invalidCount,
    };
  }

  private async mutate<T>(
    operation: () => Promise<T>,
    expectedEpoch = this.mutationEpoch,
  ): Promise<T> {
    return this.enqueue(async () => {
      if (expectedEpoch !== this.mutationEpoch) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "A queued board change was discarded after another tab changed the design.",
        );
      }
      this.patch({ saving: true, error: null });
      try {
        return await operation();
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ saving: false });
      }
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private patch(changes: Partial<BoardDesignerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export class BoardDesignerApplicationError extends Error {
  readonly name = "BoardDesignerApplicationError";

  constructor(
    readonly code: BoardMutationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new PersistenceError(
    "TRANSACTION_FAILED",
    "An unknown board-designer error occurred.",
  );
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (name.length === 0) {
    return "Untitled island";
  }
  return name.slice(0, 80);
}

function invalidDesignWarning(invalidCount: number): Error | null {
  return invalidCount === 0
    ? null
    : persistenceError(
        "INVALID_BOARD_DESIGN",
        `${invalidCount} saved board ${
          invalidCount === 1 ? "design could" : "designs could"
        } not be loaded. Valid designs remain available.`,
        { invalidCount },
      );
}

function cloneInventory(inventory: BoardInventory): BoardInventory {
  return {
    terrain: { ...inventory.terrain },
    numbers: { ...inventory.numbers },
    ports: { ...inventory.ports },
  };
}

function cloneDesign(design: BoardDesign): BoardDesign {
  return {
    ...design,
    inventory: cloneInventory(design.inventory),
    footprint: design.footprint.map((coordinate) => ({
      ...coordinate,
    })),
    hexes: design.hexes.map((hex) => ({
      ...hex,
      coordinate: { ...hex.coordinate },
    })),
    ports: design.ports.map((port) => ({
      ...port,
      landCoordinate: { ...port.landCoordinate },
    })),
  };
}
