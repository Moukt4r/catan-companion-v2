import { deleteDB, openDB, type DBSchema } from "idb";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  storedGameFromState,
} from "../../application";
import { sha256 } from "../../application/integrity";
import type {
  ExportDocument,
  ImportIdSource,
  StoredRevision,
} from "../../application";
import {
  asCommandId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  decide,
} from "../../domain";
import type {
  GameCommand,
  GameSetup,
  GameState,
  IdSource,
  JournalSummary,
} from "../../domain";
import { IndexedDbGameRepository } from "./indexedDbGameRepository";

const databases: string[] = [];
const repositories: IndexedDbGameRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repo) => repo.close()));
  for (const name of databases.splice(0)) {
    await deleteDB(name);
  }
});

function repository(): IndexedDbGameRepository {
  const name = `catan-test-${crypto.randomUUID()}`;
  databases.push(name);
  const repo = new IndexedDbGameRepository(name);
  repositories.push(repo);
  return repo;
}

function ids(prefix: string): IdSource {
  let next = 0;
  return {
    next(kind) {
      next += 1;
      return `${prefix}-${kind}-${next}`;
    },
  };
}

function setup(): GameSetup {
  const players = ["a", "b", "c"].map((suffix, index) => ({
    id: asPlayerId(`player-${suffix}`),
    name: `Player ${suffix.toUpperCase()}`,
    color: {
      id: `color-${suffix}`,
      label: `Color ${suffix}`,
      hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
      distinguishabilityKey: `key-${suffix}`,
    },
  }));
  return {
    title: "Persistence test",
    mode: "standard",
    players,
    firstPlayerId: players[0]?.id ?? asPlayerId("missing"),
    victoryTarget: 13,
    thematicCadence: "standard",
    thematicEventsEnabled: false,
    thematicEventCatalog: [],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

async function initial(
  repo: IndexedDbGameRepository,
  prefix = "base",
): Promise<{ state: GameState; revision: StoredRevision }> {
  const result = createGame({
    gameId: asGameId(`game-${prefix}`),
    revisionId: asRevisionId(`revision-${prefix}-1`),
    createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
    setup: setup(),
    random: () => 0,
    ids: ids(prefix),
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  const revision = await makeRevision(
    result.value.nextState,
    null,
    { type: "game.created" },
    result.value.summary,
  );
  await repo.createGame(storedGameFromState(result.value.nextState), revision);
  return { state: result.value.nextState, revision };
}

async function commit(
  repo: IndexedDbGameRepository,
  state: GameState,
  command: GameCommand,
  suffix: string,
): Promise<{ state: GameState; revision: StoredRevision }> {
  const revisionId = asRevisionId(`revision-${suffix}`);
  const result = decide(state, command, {
    at: asIsoTimestamp("2026-07-12T12:00:10.000Z"),
    revisionId,
    random: () => 0,
    ids: ids(suffix),
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  const commandId = asCommandId(`command-${suffix}`);
  const revision = await makeRevision(
    result.value.nextState,
    state.revisionId,
    command,
    result.value.summary,
    commandId,
  );
  await repo.commitRevision({
    gameId: state.id,
    expectedHeadRevisionId: state.revisionId,
    commandId,
    revision,
  });
  return { state: result.value.nextState, revision };
}

async function makeRevision(
  state: GameState,
  parentRevisionId: StoredRevision["parentRevisionId"],
  command: StoredRevision["command"],
  summary: JournalSummary,
  commandId = asCommandId(`command-${state.revisionId}`),
): Promise<StoredRevision> {
  return {
    id: state.revisionId,
    gameId: state.id,
    parentRevisionId,
    sequence: state.revisionNumber,
    commandId,
    command,
    summary,
    state,
    stateHash: await sha256(state),
    createdAt: state.updatedAt,
    applicationVersion: APPLICATION_VERSION,
    databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
    gameDocumentVersion: state.setup.gameDocumentVersion,
    rulesDataVersion: state.setup.rulesDataVersion,
  };
}

describe("IndexedDbGameRepository", () => {
  it("creates, commits, closes, and reloads a durable game", async () => {
    const repo = repository();
    const created = await initial(repo);
    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "2",
    );
    await repo.close();

    const loaded = await repo.loadGame(created.state.id);
    expect(loaded?.revision?.state).toEqual(rolled.state);
    expect(loaded?.game.headRevisionId).toBe(rolled.revision.id);
    expect(loaded?.recovery).toBeNull();
  });

  it("returns one idempotent commit and rejects a stale expected head", async () => {
    const repo = repository();
    const created = await initial(repo);
    const revisionId = asRevisionId("retry-revision");
    const decision = decide(
      created.state,
      { type: "roll.draw" },
      {
        at: asIsoTimestamp("2026-07-12T12:00:01.000Z"),
        revisionId,
        random: () => 0,
        ids: ids("retry"),
      },
    );
    if (!decision.ok) throw new Error(decision.error.message);
    const commandId = asCommandId("same-command");
    const revision = await makeRevision(
      decision.value.nextState,
      created.state.revisionId,
      { type: "roll.draw" },
      decision.value.summary,
      commandId,
    );
    const input = {
      gameId: created.state.id,
      expectedHeadRevisionId: created.state.revisionId,
      commandId,
      revision,
    };

    const [first, retry] = await Promise.all([
      repo.commitRevision(input),
      repo.commitRevision(input),
    ]);
    expect(first.id).toBe(retry.id);
    expect(await repo.getRevisionHistory(created.state.id)).toHaveLength(2);

    const staleRevision = { ...revision, id: asRevisionId("stale-revision") };
    await expect(
      repo.commitRevision({
        ...input,
        commandId: asCommandId("stale-command"),
        revision: {
          ...staleRevision,
          commandId: asCommandId("stale-command"),
          state: { ...staleRevision.state, revisionId: staleRevision.id },
        },
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });

  it("undoes and redoes multiple revisions with exact deck restoration", async () => {
    const repo = repository();
    const created = await initial(repo);
    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "2",
    );
    let state = rolled.state;
    if (state.resolution.official?.progressPending) {
      state = (
        await commit(
          repo,
          state,
          {
            type: "resolution.progressAcknowledged",
            rollId: state.resolution.official.rollId,
          },
          "3",
        )
      ).state;
    }
    if (state.resolution.official?.productionPending) {
      state = (
        await commit(
          repo,
          state,
          {
            type: "resolution.productionAcknowledged",
            rollId: state.resolution.official.rollId,
          },
          "4",
        )
      ).state;
    }
    const head = state;
    const beforeHead = await repo.loadGame(state.id);
    const undoOne = await repo.moveHead({
      gameId: state.id,
      expectedHeadRevisionId:
        beforeHead?.game.headRevisionId ?? state.revisionId,
      direction: "undo",
      updatedAt: asIsoTimestamp("2026-07-12T13:00:00.000Z"),
    });
    const undoTwo = await repo.moveHead({
      gameId: state.id,
      expectedHeadRevisionId: undoOne.game.headRevisionId,
      direction: "undo",
      updatedAt: asIsoTimestamp("2026-07-12T13:01:00.000Z"),
    });
    const redoOne = await repo.moveHead({
      gameId: state.id,
      expectedHeadRevisionId: undoTwo.game.headRevisionId,
      direction: "redo",
      updatedAt: asIsoTimestamp("2026-07-12T13:02:00.000Z"),
    });
    const redoTwo = await repo.moveHead({
      gameId: state.id,
      expectedHeadRevisionId: redoOne.game.headRevisionId,
      direction: "redo",
      updatedAt: asIsoTimestamp("2026-07-12T13:03:00.000Z"),
    });

    expect(redoTwo.revision?.state).toEqual(head);
    expect(redoTwo.revision?.state.numberedDeck).toEqual(head.numberedDeck);
    expect(redoTwo.revision?.state.eventDeck).toEqual(head.eventDeck);
  });

  it("retains an abandoned branch when committing after undo", async () => {
    const repo = repository();
    const created = await initial(repo);
    const firstRoll = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "2",
    );
    await repo.moveHead({
      gameId: created.state.id,
      expectedHeadRevisionId: firstRoll.revision.id,
      direction: "undo",
      updatedAt: asIsoTimestamp("2026-07-12T13:00:00.000Z"),
    });
    const secondRoll = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "branch",
    );
    const history = await repo.getRevisionHistory(created.state.id);

    expect(history.filter((revision) => revision.sequence === 2)).toHaveLength(
      2,
    );
    expect(history.map((revision) => revision.id)).toContain(
      firstRoll.revision.id,
    );
    expect((await repo.loadGame(created.state.id))?.game.headRevisionId).toBe(
      secondRoll.revision.id,
    );
  });

  it("archives and deletes a game with all revisions", async () => {
    const repo = repository();
    const created = await initial(repo);
    await commit(repo, created.state, { type: "roll.draw" }, "2");
    await repo.archiveGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T14:00:00.000Z"),
    );
    expect((await repo.listGames())[0]?.lifecycle).toBe("archived");

    await repo.deleteGame(created.state.id);
    expect(await repo.loadGame(created.state.id)).toBeNull();
    expect(await repo.getRevisionHistory(created.state.id)).toEqual([]);
  });

  it("resumes an archived game and archives the previously active game", async () => {
    const repo = repository();
    const first = await initial(repo, "first");
    await repo.archiveGame(
      first.state.id,
      asIsoTimestamp("2026-07-12T14:00:00.000Z"),
    );
    const second = await initial(repo, "second");

    const resumed = await repo.resumeGame(
      first.state.id,
      asIsoTimestamp("2026-07-12T14:30:00.000Z"),
    );
    const games = await repo.listGames();

    expect(resumed.game.lifecycle).toBe("active");
    expect(games.find((game) => game.id === second.state.id)?.lifecycle).toBe(
      "archived",
    );
  });

  it("returns corrupt and completed games without activating or archiving others", async () => {
    const repo = repository();
    const corrupt = await initial(repo, "resume-corrupt");
    await repo.close();
    const dbName = databases.at(-1) as string;
    const db = await openDB<RevisionDatabase>(dbName, DATABASE_SCHEMA_VERSION);
    await db.put("revisions", {
      ...corrupt.revision,
      stateHash: "0".repeat(64),
    });
    db.close();

    const resumed = await repo.resumeGame(
      corrupt.state.id,
      asIsoTimestamp("2026-07-12T14:30:00.000Z"),
    );

    expect(resumed.game.lifecycle).toBe("corrupt");
    expect(resumed.recovery?.validAncestorRevisionId).toBeNull();
  });

  it("reports missing games across resume, archive, export, commit, move, and recovery", async () => {
    const repo = repository();
    const missing = asGameId("missing-game");
    const timestamp = asIsoTimestamp("2026-07-12T14:30:00.000Z");
    const created = await fixtureRecords("missing-records");

    await expect(repo.resumeGame(missing, timestamp)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(repo.archiveGame(missing, timestamp)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(repo.exportGame(missing, timestamp)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      repo.commitRevision({
        gameId: missing,
        expectedHeadRevisionId: created.revision.id,
        commandId: created.revision.commandId,
        revision: created.revision,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repo.moveHead({
        gameId: missing,
        expectedHeadRevisionId: created.revision.id,
        direction: "undo",
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repo.recoverGame({
        gameId: missing,
        expectedInvalidHeadRevisionId: created.revision.id,
        validAncestorRevisionId: created.revision.id,
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects inconsistent or invalid initial and candidate revisions", async () => {
    const repo = repository();
    const candidate = await fixtureRecords("invalid-records");

    await expect(
      repo.createGame(candidate.game, {
        ...candidate.revision,
        parentRevisionId: asRevisionId("unexpected-parent"),
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_FAILED" });
    await expect(
      repo.createGame(candidate.game, {
        ...candidate.revision,
        stateHash: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });

    await repo.createGame(candidate.game, candidate.revision);
    const decided = decide(
      candidate.state,
      { type: "roll.draw" },
      {
        at: asIsoTimestamp("2026-07-12T12:00:01.000Z"),
        revisionId: asRevisionId("invalid-candidate-revision"),
        random: () => 0,
        ids: ids("invalid-candidate"),
      },
    );
    if (!decided.ok) throw new Error(decided.error.message);
    const commandId = asCommandId("invalid-candidate-command");
    const revision = await makeRevision(
      decided.value.nextState,
      candidate.revision.id,
      { type: "roll.draw" },
      decided.value.summary,
      commandId,
    );

    await expect(
      repo.commitRevision({
        gameId: candidate.game.id,
        expectedHeadRevisionId: candidate.revision.id,
        commandId,
        revision: { ...revision, gameId: asGameId("wrong-game") },
      }),
    ).rejects.toMatchObject({ code: "TRANSACTION_FAILED" });
    await expect(
      repo.commitRevision({
        gameId: candidate.game.id,
        expectedHeadRevisionId: candidate.revision.id,
        commandId,
        revision: { ...revision, stateHash: "0".repeat(64) },
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });
  });

  it("wraps IndexedDB uniqueness failures and leaves the original game intact", async () => {
    const repo = repository();
    const created = await initial(repo, "duplicate-create");
    const game = storedGameFromState(created.state);

    await expect(
      repo.createGame(game, created.revision),
    ).rejects.toBeInstanceOf(Error);
    expect(await repo.getRevisionHistory(game.id)).toEqual([created.revision]);
  });

  it("rejects unavailable undo, redo, missing current revisions, and invalid targets", async () => {
    const repo = repository();
    const created = await initial(repo, "move-errors");
    const timestamp = asIsoTimestamp("2026-07-12T17:00:00.000Z");

    await expect(
      repo.moveHead({
        gameId: created.state.id,
        expectedHeadRevisionId: created.revision.id,
        direction: "undo",
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repo.moveHead({
        gameId: created.state.id,
        expectedHeadRevisionId: created.revision.id,
        direction: "redo",
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "move-errors-child",
    );
    await repo.close();
    const dbName = databases.at(-1) as string;
    const db = await openDB<MutationDatabase>(dbName, DATABASE_SCHEMA_VERSION);
    await db.delete("revisions", rolled.revision.id);
    db.close();
    await expect(
      repo.moveHead({
        gameId: created.state.id,
        expectedHeadRevisionId: rolled.revision.id,
        direction: "undo",
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });

    await repo.close();
    const restore = await openDB<MutationDatabase>(
      dbName,
      DATABASE_SCHEMA_VERSION,
    );
    await restore.put("revisions", rolled.revision);
    await restore.put("revisions", {
      ...created.revision,
      stateHash: "0".repeat(64),
    });
    restore.close();
    await expect(
      repo.moveHead({
        gameId: created.state.id,
        expectedHeadRevisionId: rolled.revision.id,
        direction: "undo",
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });
  });

  it("exports and imports every branch under new IDs", async () => {
    const repo = repository();
    const created = await initial(repo);
    const originalRoll = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "2",
    );
    await repo.moveHead({
      gameId: created.state.id,
      expectedHeadRevisionId: originalRoll.revision.id,
      direction: "undo",
      updatedAt: asIsoTimestamp("2026-07-12T13:00:00.000Z"),
    });
    await commit(repo, created.state, { type: "roll.draw" }, "branch");
    const exported = await repo.exportGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );
    const preview = await repo.previewImport(exported);
    const importIds = sequentialImportIds();
    const importedId = await repo.importGame(preview, importIds);
    const imported = await repo.loadGame(importedId);

    expect(importedId).not.toBe(created.state.id);
    expect(imported?.revision?.state.id).toBe(importedId);
    expect(imported?.revision?.state.revisionNumber).toBe(2);
    expect(typeof imported?.revision?.state.lastRoll?.total).toBe("number");
    expect(await repo.getRevisionHistory(importedId)).toHaveLength(3);
    expect((await repo.loadGame(created.state.id))?.game.lifecycle).toBe(
      "archived",
    );
  });

  it("revalidates retained previews and keeps an active game when importing an archive", async () => {
    const repo = repository();
    const archived = await initial(repo, "archived-import-source");
    await repo.archiveGame(
      archived.state.id,
      asIsoTimestamp("2026-07-12T14:00:00.000Z"),
    );
    const exported = await repo.exportGame(
      archived.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );
    const preview = await repo.previewImport(exported);
    const active = await initial(repo, "active-during-import");

    const tampered = structuredClone(preview);
    tampered.document.game.title = "Tampered";
    await expect(
      repo.importGame(tampered, sequentialImportIds()),
    ).rejects.toMatchObject({ code: "INTEGRITY_FAILURE" });

    const importedId = await repo.importGame(preview, sequentialImportIds());
    expect((await repo.loadGame(importedId))?.game.lifecycle).toBe("archived");
    expect((await repo.loadGame(active.state.id))?.game.lifecycle).toBe(
      "active",
    );
  });

  it("rejects malformed and hash-invalid imports without mutating storage", async () => {
    const repo = repository();
    const created = await initial(repo);
    const exported = await repo.exportGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );
    const before = await repo.listGames();
    await expect(repo.previewImport({ format: "wrong" })).rejects.toMatchObject(
      {
        code: "INVALID_IMPORT",
      },
    );
    const corrupted = structuredClone(exported);
    corrupted.activeBranch[0]!.stateHash = "0".repeat(64);
    corrupted.integrity.documentHash = await documentHash(corrupted);
    await expect(repo.previewImport(corrupted)).rejects.toMatchObject({
      code: "INTEGRITY_FAILURE",
    });
    expect(await repo.listGames()).toEqual(before);
  });

  it("rejects unsupported, non-JSON, oversized, and document-hash-invalid imports", async () => {
    const repo = repository();
    await expect(
      repo.previewImport({ exportVersion: 999 }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION" });

    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(repo.previewImport(circular)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const oversized = {
      payload: "x".repeat(10 * 1024 * 1024 + 1),
    };
    await expect(repo.previewImport(oversized)).rejects.toMatchObject({
      code: "IMPORT_TOO_LARGE",
    });

    const created = await initial(repo, "bad-document-hash");
    const exported = await repo.exportGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );
    exported.integrity.documentHash = "0".repeat(64);
    await expect(repo.previewImport(exported)).rejects.toMatchObject({
      code: "INTEGRITY_FAILURE",
    });
  });

  it("rejects conflicting duplicate revisions and invalid graph references", async () => {
    const repo = repository();
    const created = await initial(repo, "graph-errors");
    const exported = await repo.exportGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );

    const conflict = structuredClone(exported);
    conflict.optionalBranches = [
      [
        {
          ...conflict.activeBranch[0]!,
          commandId: asCommandId("conflicting-command"),
        },
      ],
    ];
    conflict.integrity.documentHash = await documentHash(conflict);
    await expect(repo.previewImport(conflict)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const missingHead = structuredClone(exported);
    missingHead.game.headRevisionId = asRevisionId("missing-head");
    missingHead.integrity.documentHash = await documentHash(missingHead);
    await expect(repo.previewImport(missingHead)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const inconsistentIdentity = structuredClone(exported);
    inconsistentIdentity.activeBranch[0]!.gameId = asGameId("wrong-game");
    inconsistentIdentity.integrity.documentHash =
      await documentHash(inconsistentIdentity);
    await expect(
      repo.previewImport(inconsistentIdentity),
    ).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const missingRedo = structuredClone(exported);
    missingRedo.game.redoStack = [asRevisionId("missing-redo")];
    missingRedo.integrity.documentHash = await documentHash(missingRedo);
    await expect(repo.previewImport(missingRedo)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });
  });

  it("rejects invalid roots, parent chains, branch order, and game summaries", async () => {
    const repo = repository();
    const created = await initial(repo, "schema-branches");
    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "schema-branches-child",
    );
    const exported = await repo.exportGame(
      created.state.id,
      asIsoTimestamp("2026-07-12T15:00:00.000Z"),
    );

    const invalidRoot = structuredClone(exported);
    invalidRoot.activeBranch[0]!.command = { type: "roll.draw" };
    invalidRoot.integrity.documentHash = await documentHash(invalidRoot);
    await expect(repo.previewImport(invalidRoot)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const invalidParent = structuredClone(exported);
    invalidParent.activeBranch[1]!.parentRevisionId =
      asRevisionId("missing-parent");
    invalidParent.integrity.documentHash = await documentHash(invalidParent);
    await expect(repo.previewImport(invalidParent)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const invalidBranch = structuredClone(exported);
    invalidBranch.activeBranch = [...invalidBranch.activeBranch].reverse();
    invalidBranch.integrity.documentHash = await documentHash(invalidBranch);
    await expect(repo.previewImport(invalidBranch)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    const invalidSummary = structuredClone(exported);
    invalidSummary.game.title = "Different title";
    invalidSummary.integrity.documentHash = await documentHash(invalidSummary);
    await expect(repo.previewImport(invalidSummary)).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });

    expect(rolled.revision.sequence).toBe(2);
  });

  it("recovers to the newest valid ancestor and marks the game corrupt", async () => {
    const repo = repository();
    const created = await initial(repo);
    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "2",
    );
    await repo.close();
    const dbName = databases[databases.length - 1] as string;
    const db = await openDB<RevisionDatabase>(dbName, DATABASE_SCHEMA_VERSION);
    await db.put("revisions", {
      ...rolled.revision,
      stateHash: "0".repeat(64),
    });
    db.close();

    const loaded = await repo.loadGame(created.state.id);
    expect(loaded?.game.lifecycle).toBe("corrupt");
    expect(loaded?.revision?.id).toBe(created.revision.id);
    expect(loaded?.recovery).toMatchObject({
      invalidHeadRevisionId: rolled.revision.id,
      validAncestorRevisionId: created.revision.id,
    });

    const recovered = await repo.recoverGame({
      gameId: created.state.id,
      expectedInvalidHeadRevisionId: rolled.revision.id,
      validAncestorRevisionId: created.revision.id,
      updatedAt: asIsoTimestamp("2026-07-12T22:00:00.000Z"),
    });

    expect(recovered.recovery).toBeNull();
    expect(recovered.game.lifecycle).toBe("active");
    expect(recovered.game.headRevisionId).toBe(created.revision.id);
    expect((await repo.loadGame(created.state.id))?.revision?.state).toEqual(
      created.state,
    );
  });

  it("rejects stale, invalid, and non-ancestor recovery targets", async () => {
    const repo = repository();
    const created = await initial(repo, "recovery-errors");
    const rolled = await commit(
      repo,
      created.state,
      { type: "roll.draw" },
      "recovery-errors-child",
    );
    const timestamp = asIsoTimestamp("2026-07-12T22:00:00.000Z");

    await expect(
      repo.recoverGame({
        gameId: created.state.id,
        expectedInvalidHeadRevisionId: asRevisionId("stale-head"),
        validAncestorRevisionId: created.revision.id,
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(
      repo.recoverGame({
        gameId: created.state.id,
        expectedInvalidHeadRevisionId: rolled.revision.id,
        validAncestorRevisionId: asRevisionId("missing-target"),
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });

    const other = await fixtureRecords("unrelated-recovery");
    await repo.close();
    const dbName = databases.at(-1) as string;
    const db = await openDB<MutationDatabase>(dbName, DATABASE_SCHEMA_VERSION);
    await db.put("revisions", other.revision);
    db.close();
    await expect(
      repo.recoverGame({
        gameId: created.state.id,
        expectedInvalidHeadRevisionId: rolled.revision.id,
        validAncestorRevisionId: other.revision.id,
        updatedAt: timestamp,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_GAME" });
  });
});

interface RevisionDatabase extends DBSchema {
  revisions: { key: string; value: StoredRevision };
}

interface MutationDatabase extends DBSchema {
  games: { key: string; value: ReturnType<typeof storedGameFromState> };
  revisions: { key: string; value: StoredRevision };
}

async function fixtureRecords(prefix: string): Promise<{
  game: ReturnType<typeof storedGameFromState>;
  revision: StoredRevision;
  state: GameState;
}> {
  const result = createGame({
    gameId: asGameId(`game-${prefix}`),
    revisionId: asRevisionId(`revision-${prefix}-1`),
    createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
    setup: setup(),
    random: () => 0,
    ids: ids(prefix),
  });
  if (!result.ok) throw new Error(result.error.message);
  const revision = await makeRevision(
    result.value.nextState,
    null,
    { type: "game.created" },
    result.value.summary,
  );
  return {
    game: storedGameFromState(result.value.nextState),
    revision,
    state: result.value.nextState,
  };
}

function sequentialImportIds(): ImportIdSource {
  let revision = 0;
  let command = 0;
  return {
    gameId: () => asGameId("imported-game"),
    revisionId: () => {
      revision += 1;
      return asRevisionId(`imported-revision-${revision}`);
    },
    commandId: () => {
      command += 1;
      return asCommandId(`imported-command-${command}`);
    },
    now: () => asIsoTimestamp("2026-07-12T16:00:00.000Z"),
  };
}

async function documentHash(document: ExportDocument): Promise<string> {
  return sha256({
    ...document,
    integrity: { algorithm: "SHA-256" as const },
  });
}
