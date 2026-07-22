import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from "../../application/persistence";
import type {
  ExportDocument,
  GameRepository,
  HeadMove,
  ImportIdSource,
  LoadedGame,
  RecoveryInformation,
  RecoveryRequest,
  RevisionCommit,
  StoredGame,
  StoredRevision,
  ValidatedImport,
} from "../../application/persistence";
import { persistenceError } from "../../application/errors";
import { validateGameState } from "../../domain";
import type { GameId, GameState, IsoTimestamp, RevisionId } from "../../domain";
import { storedGameFromState } from "../../application/records";
import { sha256 } from "../../application/integrity";
import { parseExportDocument, parseGameState } from "./schemas";

export const DATABASE_NAME = "catan-table-companion";

interface CatanDatabase extends DBSchema {
  metadata: {
    key: string;
    value: { key: string; value: string | number };
  };
  games: {
    key: string;
    value: StoredGame;
    indexes: { lifecycle: StoredGame["lifecycle"] };
  };
  revisions: {
    key: string;
    value: StoredRevision;
    indexes: {
      gameId: string;
      gameCommand: [string, string];
      gameSequence: [string, number];
    };
  };
}

export class IndexedDbGameRepository implements GameRepository {
  private dbPromise: Promise<IDBPDatabase<CatanDatabase>> | null = null;

  constructor(private readonly databaseName = DATABASE_NAME) {}

  async initialize(): Promise<void> {
    await this.database();
  }

  async close(): Promise<void> {
    if (this.dbPromise !== null) {
      (await this.dbPromise).close();
      this.dbPromise = null;
    }
  }

  async listGames(): Promise<StoredGame[]> {
    const games = await (await this.database()).getAll("games");
    return games.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async loadGame(id: GameId): Promise<LoadedGame | null> {
    const db = await this.database();
    const game = await db.get("games", id);
    if (game === undefined) {
      return null;
    }
    const { invalidRevisionIds, validRevision } =
      await this.inspectRevisionChain(db, game);
    if (invalidRevisionIds.length === 0) {
      return { game, revision: validRevision, recovery: null };
    }
    const corruptGame: StoredGame = { ...game, lifecycle: "corrupt" };
    await db.put("games", corruptGame);
    const recovery: RecoveryInformation = {
      invalidHeadRevisionId: game.headRevisionId,
      validAncestorRevisionId: validRevision?.id ?? null,
      invalidRevisionIds,
    };
    return { game: corruptGame, revision: validRevision, recovery };
  }

  async getRevisionHistory(id: GameId): Promise<StoredRevision[]> {
    const revisions = await (
      await this.database()
    ).getAllFromIndex("revisions", "gameId", id);
    return revisions.sort(
      (left, right) =>
        left.sequence - right.sequence ||
        left.createdAt.localeCompare(right.createdAt),
    );
  }

  async resumeGame(id: GameId, at: IsoTimestamp): Promise<LoadedGame> {
    const loaded = await this.loadGame(id);
    if (loaded === null) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    if (loaded.recovery !== null || loaded.revision === null) {
      return loaded;
    }
    if (loaded.revision.state.status === "completed") {
      return loaded;
    }
    const db = await this.database();
    const transaction = db.transaction("games", "readwrite");
    try {
      const games = transaction.objectStore("games");
      const activeGames = await games.index("lifecycle").getAll("active");
      for (const active of activeGames) {
        if (active.id !== id) {
          await games.put({ ...active, lifecycle: "archived", updatedAt: at });
        }
      }
      const current = await games.get(id);
      if (
        current === undefined ||
        current.headRevisionId !== loaded.game.headRevisionId
      ) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "The game changed while it was being resumed.",
        );
      }
      const resumed: StoredGame = {
        ...current,
        lifecycle: "active",
        updatedAt: at,
      };
      await games.put(resumed);
      await transaction.done;
      return { game: resumed, revision: loaded.revision, recovery: null };
    } catch (error) {
      await abortTransaction(transaction);
      if (error instanceof Error && error.name === "PersistenceError") {
        throw error;
      }
      throw this.transactionError(error, "Could not resume the game.");
    }
  }

  async createGame(game: StoredGame, revision: StoredRevision): Promise<void> {
    this.assertInitialRecords(game, revision);
    if (!(await this.isRevisionValid(revision))) {
      throw persistenceError("CORRUPT_GAME", "Initial revision is invalid.");
    }
    const db = await this.database();
    const transaction = db.transaction(["games", "revisions"], "readwrite");
    try {
      const activeGames = await transaction
        .objectStore("games")
        .index("lifecycle")
        .getAll("active");
      for (const active of activeGames) {
        await transaction.objectStore("games").put({
          ...active,
          lifecycle: "archived",
          updatedAt: game.createdAt,
        });
      }
      await transaction.objectStore("revisions").add(revision);
      await transaction.objectStore("games").add(game);
      await transaction.done;
    } catch (error) {
      await abortTransaction(transaction);
      throw this.transactionError(error, "Could not create the game.");
    }
  }

  async commitRevision(input: RevisionCommit): Promise<StoredRevision> {
    const db = await this.database();
    const preflightDuplicate = await db.getFromIndex(
      "revisions",
      "gameCommand",
      [input.gameId, input.commandId],
    );
    if (preflightDuplicate !== undefined) {
      return preflightDuplicate;
    }
    const preflightGame = await db.get("games", input.gameId);
    if (preflightGame === undefined) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    if (preflightGame.headRevisionId !== input.expectedHeadRevisionId) {
      const committedRetry = await db.getFromIndex("revisions", "gameCommand", [
        input.gameId,
        input.commandId,
      ]);
      if (committedRetry !== undefined) {
        return committedRetry;
      }
      throw persistenceError(
        "REVISION_CONFLICT",
        "The game changed in another tab.",
        {
          expectedHeadRevisionId: input.expectedHeadRevisionId,
          actualHeadRevisionId: preflightGame.headRevisionId,
        },
      );
    }
    this.assertCommit(preflightGame, input);
    if (!(await this.isRevisionValid(input.revision))) {
      throw persistenceError(
        "CORRUPT_GAME",
        "The candidate revision is invalid.",
      );
    }
    const transaction = db.transaction(["games", "revisions"], "readwrite");
    try {
      const revisions = transaction.objectStore("revisions");
      const duplicate = await revisions
        .index("gameCommand")
        .get([input.gameId, input.commandId]);
      if (duplicate !== undefined) {
        await transaction.done;
        return duplicate;
      }
      const games = transaction.objectStore("games");
      const game = await games.get(input.gameId);
      if (game === undefined) {
        throw persistenceError("NOT_FOUND", "Game was not found.");
      }
      if (game.headRevisionId !== input.expectedHeadRevisionId) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "The game changed in another tab.",
          {
            expectedHeadRevisionId: input.expectedHeadRevisionId,
            actualHeadRevisionId: game.headRevisionId,
          },
        );
      }
      await revisions.add(input.revision);
      await games.put({
        ...updateGameFromState(game, input.revision.state, input.revision.id),
        latestRevisionId: input.revision.id,
        redoStack: [],
      });
      await transaction.done;
      return input.revision;
    } catch (error) {
      await abortTransaction(transaction);
      if (error instanceof Error && error.name === "PersistenceError") {
        throw error;
      }
      throw this.transactionError(error, "Could not save the revision.");
    }
  }

  async recoverGame(input: RecoveryRequest): Promise<LoadedGame> {
    const db = await this.database();
    const game = await db.get("games", input.gameId);
    if (game === undefined) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    if (game.headRevisionId !== input.expectedInvalidHeadRevisionId) {
      throw persistenceError(
        "REVISION_CONFLICT",
        "The corrupt game changed before recovery.",
      );
    }
    const target = await db.get("revisions", input.validAncestorRevisionId);
    if (target === undefined || !(await this.isRevisionValid(target))) {
      throw persistenceError(
        "CORRUPT_GAME",
        "The selected recovery revision is not valid.",
      );
    }
    let cursor: RevisionId | null = game.headRevisionId;
    const seen = new Set<string>();
    let found = false;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        break;
      }
      seen.add(cursor);
      if (cursor === target.id) {
        found = true;
        break;
      }
      const revision: StoredRevision | undefined = await db.get(
        "revisions",
        cursor,
      );
      cursor = revision?.parentRevisionId ?? null;
    }
    if (!found) {
      throw persistenceError(
        "CORRUPT_GAME",
        "The recovery revision is not an ancestor of the corrupt head.",
      );
    }

    const transaction = db.transaction("games", "readwrite");
    try {
      const games = transaction.objectStore("games");
      const current = await games.get(input.gameId);
      if (
        current === undefined ||
        current.headRevisionId !== input.expectedInvalidHeadRevisionId
      ) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "The corrupt game changed before recovery.",
        );
      }
      if (target.state.status === "active") {
        const activeGames = await games.index("lifecycle").getAll("active");
        for (const active of activeGames) {
          if (active.id !== current.id) {
            await games.put({
              ...active,
              lifecycle: "archived",
              updatedAt: input.updatedAt,
            });
          }
        }
      }
      const summary = storedGameFromState(target.state, target.state.status);
      const recovered: StoredGame = {
        ...summary,
        headRevisionId: target.id,
        latestRevisionId: current.latestRevisionId,
        redoStack: [],
        createdAt: current.createdAt,
        updatedAt: input.updatedAt,
      };
      await games.put(recovered);
      await transaction.done;
      return { game: recovered, revision: target, recovery: null };
    } catch (error) {
      await abortTransaction(transaction);
      if (error instanceof Error && error.name === "PersistenceError") {
        throw error;
      }
      throw this.transactionError(error, "Could not recover the game.");
    }
  }

  async moveHead(input: HeadMove): Promise<LoadedGame> {
    const db = await this.database();
    const preflightGame = await db.get("games", input.gameId);
    if (preflightGame === undefined) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    const preflightCurrent = await db.get(
      "revisions",
      input.expectedHeadRevisionId,
    );
    if (preflightCurrent === undefined) {
      throw persistenceError(
        "CORRUPT_GAME",
        "The current revision is missing.",
      );
    }
    const preflightTargetId =
      input.direction === "undo"
        ? preflightCurrent.parentRevisionId
        : preflightGame.redoStack.at(-1);
    if (preflightTargetId === null || preflightTargetId === undefined) {
      throw persistenceError(
        "NOT_FOUND",
        input.direction === "undo"
          ? "There is no earlier revision."
          : "There is no revision to redo.",
      );
    }
    const preflightTarget = await db.get("revisions", preflightTargetId);
    if (
      preflightTarget === undefined ||
      !(await this.isRevisionValid(preflightTarget))
    ) {
      throw persistenceError("CORRUPT_GAME", "The target revision is invalid.");
    }
    const transaction = db.transaction(["games", "revisions"], "readwrite");
    try {
      const games = transaction.objectStore("games");
      const revisions = transaction.objectStore("revisions");
      const game = await games.get(input.gameId);
      if (game === undefined) {
        throw persistenceError("NOT_FOUND", "Game was not found.");
      }
      if (game.headRevisionId !== input.expectedHeadRevisionId) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "The game changed in another tab.",
        );
      }
      const current = await revisions.get(game.headRevisionId);
      if (current === undefined) {
        throw persistenceError(
          "CORRUPT_GAME",
          "The current revision is missing.",
        );
      }
      let target: StoredRevision | undefined;
      let redoStack: RevisionId[];
      if (input.direction === "undo") {
        if (current.parentRevisionId === null) {
          throw persistenceError("NOT_FOUND", "There is no earlier revision.");
        }
        target = await revisions.get(current.parentRevisionId);
        redoStack = [...game.redoStack, current.id];
      } else {
        const targetId = game.redoStack.at(-1);
        if (targetId === undefined) {
          throw persistenceError("NOT_FOUND", "There is no revision to redo.");
        }
        target = await revisions.get(targetId);
        redoStack = game.redoStack.slice(0, -1);
        if (target?.parentRevisionId !== current.id) {
          throw persistenceError(
            "CORRUPT_GAME",
            "The redo path is inconsistent.",
          );
        }
      }
      if (target === undefined || target.id !== preflightTarget.id) {
        throw persistenceError(
          "CORRUPT_GAME",
          "The target revision is invalid.",
        );
      }
      const moved = updateGameFromState(
        { ...game, redoStack, updatedAt: input.updatedAt },
        target.state,
        target.id,
      );
      await games.put(moved);
      await transaction.done;
      return { game: moved, revision: target, recovery: null };
    } catch (error) {
      await abortTransaction(transaction);
      if (error instanceof Error && error.name === "PersistenceError") {
        throw error;
      }
      throw this.transactionError(error, "Could not move revision history.");
    }
  }

  async archiveGame(id: GameId, at: IsoTimestamp): Promise<void> {
    const db = await this.database();
    const game = await db.get("games", id);
    if (game === undefined) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    await db.put("games", { ...game, lifecycle: "archived", updatedAt: at });
  }

  async deleteGame(id: GameId): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction(["games", "revisions"], "readwrite");
    try {
      await transaction.objectStore("games").delete(id);
      let cursor = await transaction
        .objectStore("revisions")
        .index("gameId")
        .openKeyCursor(id);
      while (cursor !== null) {
        await transaction.objectStore("revisions").delete(cursor.primaryKey);
        cursor = await cursor.continue();
      }
      await transaction.done;
    } catch (error) {
      await abortTransaction(transaction);
      throw this.transactionError(error, "Could not delete the game.");
    }
  }

  async exportGame(
    id: GameId,
    exportedAt: IsoTimestamp,
  ): Promise<ExportDocument> {
    const game = await (await this.database()).get("games", id);
    if (game === undefined) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    const revisions = await this.getRevisionHistory(id);
    for (const revision of revisions) {
      if (!(await this.isRevisionValid(revision))) {
        throw persistenceError(
          "CORRUPT_GAME",
          "A corrupt game cannot be exported as a verified backup.",
          { revisionId: revision.id },
        );
      }
    }
    const byId = new Map(revisions.map((revision) => [revision.id, revision]));
    const activeBranch = pathToRoot(game.headRevisionId, byId);
    const parentIds = new Set(
      revisions.flatMap((revision) =>
        revision.parentRevisionId === null ? [] : [revision.parentRevisionId],
      ),
    );
    const optionalBranches = revisions
      .filter(
        (revision) =>
          revision.id !== game.headRevisionId && !parentIds.has(revision.id),
      )
      .map((revision) => pathToRoot(revision.id, byId));
    const unsigned = {
      format: EXPORT_FORMAT as typeof EXPORT_FORMAT,
      exportVersion: EXPORT_VERSION as typeof EXPORT_VERSION,
      exportedAt,
      applicationVersion: APPLICATION_VERSION,
      game,
      activeBranch,
      ...(optionalBranches.length === 0 ? {} : { optionalBranches }),
      integrity: { algorithm: "SHA-256" as const },
    };
    return {
      ...unsigned,
      integrity: {
        algorithm: "SHA-256",
        documentHash: await sha256(unsigned),
      },
    };
  }

  async previewImport(input: unknown): Promise<ValidatedImport> {
    const { document, revisions } = await parseExportDocument(input);
    const head = revisions.find(
      (revision) => revision.id === document.game.headRevisionId,
    );
    if (head === undefined) {
      throw persistenceError("INVALID_IMPORT", "The head revision is missing.");
    }
    return {
      document,
      revisions,
      preview: {
        title: document.game.title,
        playerNames: document.game.players.map((player) => player.name),
        createdAt: document.game.createdAt,
        updatedAt: document.game.updatedAt,
        revisionCount: revisions.length,
        completedTurns: head.state.turn.completedTurns,
        sourceApplicationVersion: document.applicationVersion,
        sourceDocumentVersion: document.game.gameDocumentVersion,
      },
    };
  }

  async importGame(
    input: ValidatedImport,
    ids: ImportIdSource,
  ): Promise<GameId> {
    // Revalidate the retained preview so callers cannot construct a trusted wrapper.
    const validated = await this.previewImport(input.document);
    const newGameId = ids.gameId();
    const revisionIds = new Map(
      validated.revisions.map((revision) => [revision.id, ids.revisionId()]),
    );
    const transformed: StoredRevision[] = [];
    for (const source of validated.revisions) {
      const revisionId = revisionIds.get(source.id);
      if (revisionId === undefined) {
        throw persistenceError("INVALID_IMPORT", "Revision mapping failed.");
      }
      const state = remapState(
        source.state,
        newGameId,
        revisionId,
        revisionIds,
      );
      transformed.push({
        ...source,
        id: revisionId,
        gameId: newGameId,
        parentRevisionId:
          source.parentRevisionId === null
            ? null
            : requiredMappedId(revisionIds, source.parentRevisionId),
        commandId: ids.commandId(),
        state,
        stateHash: await sha256(state),
        applicationVersion: APPLICATION_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      });
    }
    const sourceGame = validated.document.game;
    const headRevisionId = requiredMappedId(
      revisionIds,
      sourceGame.headRevisionId,
    );
    const latestRevisionId = requiredMappedId(
      revisionIds,
      sourceGame.latestRevisionId,
    );
    const importedAt = ids.now();
    const game: StoredGame = {
      ...sourceGame,
      id: newGameId,
      headRevisionId,
      latestRevisionId,
      redoStack: sourceGame.redoStack.map((id) =>
        requiredMappedId(revisionIds, id),
      ),
      updatedAt: importedAt,
    };
    const db = await this.database();
    const transaction = db.transaction(["games", "revisions"], "readwrite");
    try {
      if (game.lifecycle === "active") {
        const activeGames = await transaction
          .objectStore("games")
          .index("lifecycle")
          .getAll("active");
        for (const active of activeGames) {
          await transaction.objectStore("games").put({
            ...active,
            lifecycle: "archived",
            updatedAt: importedAt,
          });
        }
      }
      for (const revision of transformed) {
        await transaction.objectStore("revisions").add(revision);
      }
      await transaction.objectStore("games").add(game);
      await transaction.done;
      return newGameId;
    } catch (error) {
      await abortTransaction(transaction);
      throw this.transactionError(error, "Could not import the game.");
    }
  }

  private async inspectRevisionChain(
    db: IDBPDatabase<CatanDatabase>,
    game: StoredGame,
  ): Promise<{
    validRevision: StoredRevision | null;
    invalidRevisionIds: RevisionId[];
  }> {
    const chain: StoredRevision[] = [];
    const invalidRevisionIds = new Set<RevisionId>();
    const seen = new Set<RevisionId>();
    let revisionId: RevisionId | null = game.headRevisionId;
    let complete = false;

    while (revisionId !== null) {
      if (seen.has(revisionId)) {
        invalidRevisionIds.add(revisionId);
        break;
      }
      seen.add(revisionId);
      const revision: StoredRevision | undefined = await db.get(
        "revisions",
        revisionId,
      );
      if (revision === undefined) {
        invalidRevisionIds.add(revisionId);
        break;
      }
      chain.push(revision);
      revisionId = revision.parentRevisionId;
    }
    if (revisionId === null) {
      complete = true;
    }

    let validRevision: StoredRevision | null = null;
    let previous: StoredRevision | null = null;
    let lineageValid = complete;
    for (const revision of [...chain].reverse()) {
      const linkValid =
        revision.gameId === game.id &&
        (previous === null
          ? revision.parentRevisionId === null &&
            revision.sequence === 1 &&
            revision.command.type === "game.created"
          : revision.parentRevisionId === previous.id &&
            revision.sequence === previous.sequence + 1 &&
            revision.command.type !== "game.created");
      const revisionValid =
        lineageValid && linkValid && (await this.isRevisionValid(revision));
      if (revisionValid) {
        validRevision = revision;
        previous = revision;
      } else {
        lineageValid = false;
        invalidRevisionIds.add(revision.id);
      }
    }

    if (!complete) {
      for (const revision of chain) {
        invalidRevisionIds.add(revision.id);
      }
      validRevision = null;
    }

    return {
      validRevision,
      invalidRevisionIds: [...invalidRevisionIds],
    };
  }

  private async database(): Promise<IDBPDatabase<CatanDatabase>> {
    this.dbPromise ??= openDB<CatanDatabase>(
      this.databaseName,
      DATABASE_SCHEMA_VERSION,
      {
        upgrade(database) {
          database.createObjectStore("metadata", { keyPath: "key" });
          const games = database.createObjectStore("games", { keyPath: "id" });
          games.createIndex("lifecycle", "lifecycle");
          const revisions = database.createObjectStore("revisions", {
            keyPath: "id",
          });
          revisions.createIndex("gameId", "gameId");
          revisions.createIndex("gameCommand", ["gameId", "commandId"], {
            unique: true,
          });
          revisions.createIndex("gameSequence", ["gameId", "sequence"]);
        },
      },
    );
    try {
      const db = await this.dbPromise;
      await db.put("metadata", {
        key: "schemaVersion",
        value: DATABASE_SCHEMA_VERSION,
      });
      return db;
    } catch (error) {
      this.dbPromise = null;
      throw persistenceError(
        "STORAGE_UNAVAILABLE",
        "IndexedDB could not be opened.",
        {},
        error,
      );
    }
  }

  private async isRevisionValid(revision: StoredRevision): Promise<boolean> {
    try {
      parseGameState(revision.state);
      return (
        revision.state.id === revision.gameId &&
        revision.state.revisionId === revision.id &&
        revision.state.revisionNumber === revision.sequence &&
        validateGameState(revision.state).length === 0 &&
        (await sha256(revision.state)) === revision.stateHash
      );
    } catch {
      return false;
    }
  }

  private assertInitialRecords(
    game: StoredGame,
    revision: StoredRevision,
  ): void {
    if (
      revision.parentRevisionId !== null ||
      revision.sequence !== 1 ||
      revision.command.type !== "game.created" ||
      revision.gameId !== game.id ||
      revision.id !== game.headRevisionId ||
      revision.state.id !== game.id ||
      revision.state.revisionId !== revision.id
    ) {
      throw persistenceError(
        "TRANSACTION_FAILED",
        "Initial records are inconsistent.",
      );
    }
  }

  private assertCommit(game: StoredGame, input: RevisionCommit): void {
    const { revision } = input;
    if (
      revision.gameId !== game.id ||
      revision.parentRevisionId !== input.expectedHeadRevisionId ||
      revision.commandId !== input.commandId ||
      revision.state.id !== game.id ||
      revision.state.revisionId !== revision.id ||
      revision.state.revisionNumber !== revision.sequence
    ) {
      throw persistenceError(
        "TRANSACTION_FAILED",
        "Revision commit is inconsistent.",
      );
    }
  }

  private transactionError(error: unknown, message: string): Error {
    if (error instanceof Error && error.name === "PersistenceError") {
      return error;
    }
    return persistenceError("TRANSACTION_FAILED", message, {}, error);
  }
}

function updateGameFromState(
  game: StoredGame,
  state: GameState,
  headRevisionId: RevisionId,
): StoredGame {
  const summary = storedGameFromState(
    state,
    game.lifecycle === "archived" ? "archived" : state.status,
  );
  return {
    ...summary,
    lifecycle:
      game.lifecycle === "corrupt"
        ? "corrupt"
        : game.lifecycle === "archived"
          ? "archived"
          : state.status,
    headRevisionId,
    latestRevisionId: game.latestRevisionId,
    redoStack: game.redoStack,
    createdAt: game.createdAt,
    ...(state.status === "completed"
      ? { completedAt: game.completedAt ?? state.updatedAt }
      : {}),
  };
}

function pathToRoot(
  leafId: RevisionId,
  revisions: ReadonlyMap<RevisionId, StoredRevision>,
): StoredRevision[] {
  const path: StoredRevision[] = [];
  let id: RevisionId | null = leafId;
  const seen = new Set<string>();
  while (id !== null) {
    if (seen.has(id)) {
      throw persistenceError(
        "CORRUPT_GAME",
        "Revision history contains a cycle.",
      );
    }
    seen.add(id);
    const revision = revisions.get(id);
    if (revision === undefined) {
      throw persistenceError("CORRUPT_GAME", "Revision history is incomplete.");
    }
    path.push(revision);
    id = revision.parentRevisionId;
  }
  return path.reverse();
}

function remapState(
  source: GameState,
  gameId: GameId,
  revisionId: RevisionId,
  revisionIds: ReadonlyMap<RevisionId, RevisionId>,
): GameState {
  const state = structuredClone(source);
  state.id = gameId;
  state.revisionId = revisionId;
  state.numberedDeck.createdAtRevision =
    revisionIds.get(state.numberedDeck.createdAtRevision) ?? revisionId;
  state.eventDeck.createdAtRevision =
    revisionIds.get(state.eventDeck.createdAtRevision) ?? revisionId;
  state.thematicEvents.triggerBag.createdAtRevision =
    revisionIds.get(state.thematicEvents.triggerBag.createdAtRevision) ??
    revisionId;
  state.thematicEvents.eventDeck.createdAtRevision =
    revisionIds.get(state.thematicEvents.eventDeck.createdAtRevision) ??
    revisionId;
  return state;
}

function requiredMappedId(
  ids: ReadonlyMap<RevisionId, RevisionId>,
  source: RevisionId,
): RevisionId {
  const mapped = ids.get(source);
  if (mapped === undefined) {
    throw persistenceError(
      "INVALID_IMPORT",
      "A revision reference is missing.",
    );
  }
  return mapped;
}

async function abortTransaction(transaction: {
  abort(): void;
  done: Promise<unknown>;
}): Promise<void> {
  try {
    transaction.abort();
  } catch {
    // The transaction may already have failed or completed.
  }
  try {
    await transaction.done;
  } catch {
    // The original typed error is more useful than IndexedDB's AbortError.
  }
}
