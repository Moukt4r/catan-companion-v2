import { deleteDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import {
  asBoardDesignId,
  asIsoTimestamp,
  BOARD_DOCUMENT_VERSION,
  createClassicIslandInventory,
  type BoardDesign,
} from "../../domain";
import { IndexedDbBoardDesignRepository } from "./indexedDbBoardDesignRepository";

const databases: string[] = [];
const repositories: IndexedDbBoardDesignRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repo) => repo.close()));
  for (const name of databases.splice(0)) {
    await deleteDB(name);
  }
});

describe("IndexedDbBoardDesignRepository", () => {
  it("persists, lists, loads, updates, and deletes designs", async () => {
    const repository = makeRepository();
    const design = fixture();
    await repository.initialize();
    await repository.saveDesign(design, null);

    await expect(repository.listDesigns()).resolves.toEqual({
      designs: [design],
      invalidCount: 0,
    });
    await expect(repository.loadDesign(design.id)).resolves.toEqual(design);

    const updated: BoardDesign = {
      ...design,
      revision: 1,
      name: "Updated island",
      updatedAt: asIsoTimestamp("2026-07-23T13:00:00.000Z"),
    };
    await repository.saveDesign(updated, 0);
    await expect(repository.loadDesign(design.id)).resolves.toEqual(updated);

    await repository.deleteDesign(design.id, 1);
    await expect(repository.loadDesign(design.id)).resolves.toBeNull();
  });

  it("rejects malformed designs before writing", async () => {
    const repository = makeRepository();
    const invalid = fixture();
    invalid.inventory.terrain.forest = 0;
    invalid.hexes = [
      {
        coordinate: { q: 0, r: 0 },
        terrain: "forest",
        numberToken: null,
      },
    ];

    await expect(repository.saveDesign(invalid, null)).rejects.toMatchObject({
      code: "INVALID_BOARD_DESIGN",
    });
    await expect(repository.listDesigns()).resolves.toEqual({
      designs: [],
      invalidCount: 0,
    });
  });

  it("returns valid designs while reporting corrupt records", async () => {
    const name = `catan-board-corrupt-${crypto.randomUUID()}`;
    databases.push(name);
    const repository = new IndexedDbBoardDesignRepository(name);
    repositories.push(repository);
    const design = fixture();
    await repository.saveDesign(design, null);
    await putRawDesign(name, { id: "broken-design", unexpected: true });

    await expect(repository.listDesigns()).resolves.toEqual({
      designs: [design],
      invalidCount: 1,
    });
  });

  it("rejects stale writes and deletes from another repository instance", async () => {
    const name = `catan-board-conflict-${crypto.randomUUID()}`;
    databases.push(name);
    const first = new IndexedDbBoardDesignRepository(name);
    const second = new IndexedDbBoardDesignRepository(name);
    repositories.push(first, second);
    const design = fixture();
    await first.saveDesign(design, null);
    const stale = await second.loadDesign(design.id);
    if (!stale) {
      throw new Error("Stored design was not found.");
    }
    const updated: BoardDesign = {
      ...design,
      revision: 1,
      name: "First tab",
    };
    await first.saveDesign(updated, 0);

    await expect(
      second.saveDesign(
        {
          ...stale,
          revision: 1,
          name: "Second tab",
        },
        0,
      ),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(second.deleteDesign(design.id, 0)).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    await expect(first.loadDesign(design.id)).resolves.toMatchObject({
      revision: 1,
      name: "First tab",
    });
  });
});

function makeRepository(): IndexedDbBoardDesignRepository {
  const name = `catan-board-test-${crypto.randomUUID()}`;
  databases.push(name);
  const repository = new IndexedDbBoardDesignRepository(name);
  repositories.push(repository);
  return repository;
}

function fixture(): BoardDesign {
  return {
    documentVersion: BOARD_DOCUMENT_VERSION,
    id: asBoardDesignId("repository-board"),
    revision: 0,
    name: "Repository island",
    createdAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    updatedAt: asIsoTimestamp("2026-07-23T12:00:00.000Z"),
    inventory: createClassicIslandInventory(),
    footprint: [],
    hexes: [],
    ports: [],
  };
}

async function putRawDesign(
  databaseName: string,
  value: Record<string, unknown>,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Unable to open board test storage."));
    };
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("designs", "readwrite");
      transaction.objectStore("designs").put(value);
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(
          transaction.error ?? new Error("Unable to write corrupt design."),
        );
      };
    });
  } finally {
    database.close();
  }
}
