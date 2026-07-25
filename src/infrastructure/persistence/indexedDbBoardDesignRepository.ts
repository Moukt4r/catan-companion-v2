import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  BOARD_DESIGN_DATABASE_VERSION,
  type BoardDesignList,
  type BoardDesignRepository,
} from "../../application/boardDesigns";
import { isPersistenceError, persistenceError } from "../../application/errors";
import type { BoardDesign, BoardDesignId } from "../../domain";
import { parseBoardDesign } from "./boardDesignSchemas";

export const BOARD_DESIGN_DATABASE_NAME = "catan-table-companion-board-designs";

interface BoardDesignDatabase extends DBSchema {
  designs: {
    key: string;
    value: BoardDesign;
  };
}

export class IndexedDbBoardDesignRepository implements BoardDesignRepository {
  private dbPromise: Promise<IDBPDatabase<BoardDesignDatabase>> | null = null;

  constructor(private readonly databaseName = BOARD_DESIGN_DATABASE_NAME) {}

  async initialize(): Promise<void> {
    await this.database();
  }

  async close(): Promise<void> {
    if (this.dbPromise !== null) {
      (await this.dbPromise).close();
      this.dbPromise = null;
    }
  }

  async listDesigns(): Promise<BoardDesignList> {
    try {
      const records = await (await this.database()).getAll("designs");
      const designs: BoardDesign[] = [];
      let invalidCount = 0;
      for (const record of records) {
        try {
          designs.push(parseBoardDesign(record));
        } catch (error) {
          if (
            !isPersistenceError(error) ||
            (error.code !== "INVALID_BOARD_DESIGN" &&
              error.code !== "UNSUPPORTED_VERSION")
          ) {
            throw error;
          }
          invalidCount += 1;
        }
      }
      return {
        designs: designs.sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        ),
        invalidCount,
      };
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async loadDesign(id: BoardDesignId): Promise<BoardDesign | null> {
    try {
      const design = await (await this.database()).get("designs", id);
      return design === undefined ? null : parseBoardDesign(design);
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async saveDesign(
    design: BoardDesign,
    expectedRevision: number | null,
  ): Promise<void> {
    try {
      const parsed = parseBoardDesign(design);
      const database = await this.database();
      const transaction = database.transaction("designs", "readwrite");
      const store = transaction.objectStore("designs");
      const current = await store.get(parsed.id);
      const matchesExpectation =
        expectedRevision === null
          ? current === undefined && parsed.revision === 0
          : current?.revision === expectedRevision &&
            parsed.revision === expectedRevision + 1;
      if (!matchesExpectation) {
        await transaction.done;
        throw persistenceError(
          "REVISION_CONFLICT",
          "The board design changed in another tab.",
          {
            expectedRevision,
            actualRevision: current?.revision ?? null,
          },
        );
      }
      await store.put(parsed);
      await transaction.done;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  async deleteDesign(
    id: BoardDesignId,
    expectedRevision: number,
  ): Promise<void> {
    try {
      const database = await this.database();
      const transaction = database.transaction("designs", "readwrite");
      const store = transaction.objectStore("designs");
      const current = await store.get(id);
      if (current?.revision !== expectedRevision) {
        await transaction.done;
        throw persistenceError(
          "REVISION_CONFLICT",
          "The board design changed in another tab.",
          {
            expectedRevision,
            actualRevision: current?.revision ?? null,
          },
        );
      }
      await store.delete(id);
      await transaction.done;
    } catch (error) {
      throw normalizeStorageError(error);
    }
  }

  private async database(): Promise<IDBPDatabase<BoardDesignDatabase>> {
    this.dbPromise ??= openDB<BoardDesignDatabase>(
      this.databaseName,
      BOARD_DESIGN_DATABASE_VERSION,
      {
        upgrade(database) {
          if (!database.objectStoreNames.contains("designs")) {
            database.createObjectStore("designs", { keyPath: "id" });
          }
        },
      },
    );
    try {
      return await this.dbPromise;
    } catch (error) {
      this.dbPromise = null;
      throw persistenceError(
        "STORAGE_UNAVAILABLE",
        "Board-design storage could not be opened.",
        {},
        error,
      );
    }
  }
}

function normalizeStorageError(error: unknown): Error {
  if (isPersistenceError(error)) {
    return error;
  }
  return persistenceError(
    "TRANSACTION_FAILED",
    "The board design could not be saved.",
    {},
    error,
  );
}
