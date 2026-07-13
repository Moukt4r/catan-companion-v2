import { createGame, decide, validateGameState } from "../domain";
import type {
  GameCommand,
  GameId,
  GameSetup,
  GameState,
  JournalSummary,
  RandomSource,
  RevisionId,
} from "../domain";
import { PersistenceError, persistenceError } from "./errors";
import type { GameChannel } from "./broadcast";
import type { GameControl } from "./control";
import type {
  ExportDocument,
  GameRepository,
  ImportPreview,
  LoadedGame,
  RecoveryInformation,
  StoredGame,
  StoredRevision,
  ValidatedImport,
} from "./persistence";
import { APPLICATION_VERSION, DATABASE_SCHEMA_VERSION } from "./persistence";
import type { RuntimeDependencies } from "./runtime";
import { storedGameFromState } from "./records";
import { sha256 } from "./integrity";

export interface ControllerSnapshot {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: Error | null;
  activeState: GameState | null;
  games: StoredGame[];
  revisionHistory: StoredRevision[];
  canUndo: boolean;
  canRedo: boolean;
  lastSavedAt: string | null;
  importPreview: ImportPreview | null;
  recovery: RecoveryInformation | null;
  readOnly: boolean;
}

export class GameController {
  private snapshot: ControllerSnapshot = {
    initialized: false,
    loading: false,
    saving: false,
    error: null,
    activeState: null,
    games: [],
    revisionHistory: [],
    canUndo: false,
    canRedo: false,
    recovery: null,
    readOnly: false,
    lastSavedAt: null,
    importPreview: null,
  };
  private readonly listeners = new Set<() => void>();
  private mutationTail: Promise<void> = Promise.resolve();
  private activeGame: StoredGame | null = null;
  private pendingImport: ValidatedImport | null = null;
  private readonly tabId: string;
  private readonly unsubscribeChannel: (() => void) | null;

  constructor(
    private readonly repository: GameRepository,
    private readonly random: RandomSource,
    private readonly runtime: RuntimeDependencies,
    private readonly channel?: GameChannel,
    private readonly control?: GameControl,
  ) {
    this.tabId = runtime.commandId();
    this.unsubscribeChannel =
      channel?.subscribe((message) => {
        if (
          message.type === "revision" &&
          message.tabId !== this.tabId &&
          message.gameId === this.activeGame?.id
        ) {
          void this.enqueue(async () => {
            await this.reloadActive(
              persistenceError(
                "REVISION_CONFLICT",
                "This game changed in another tab.",
              ),
            );
          });
        }
      }) ?? null;
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize(): Promise<void> {
    await this.enqueue(async () => {
      this.patch({ loading: true, error: null });
      try {
        await this.repository.initialize();
        const games = await this.repository.listGames();
        const active = games.find((game) => game.lifecycle === "active");
        if (active !== undefined) {
          await this.acquireControl(active.id);
          await this.loadIntoSnapshot(active.id);
        } else {
          await this.releaseControl();
          this.activeGame = null;
          this.patch({
            games,
            activeState: null,
            revisionHistory: [],
            canUndo: false,
            canRedo: false,
            recovery: null,
            readOnly: false,
          });
        }
        this.channel?.post({ type: "presence", tabId: this.tabId });
        this.patch({ initialized: true });
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  async startGame(setup: GameSetup): Promise<void> {
    await this.mutate(async () => {
      const gameId = this.runtime.gameId();
      const revisionId = this.runtime.revisionId();
      const createdAt = this.runtime.now();
      const result = createGame({
        gameId,
        revisionId,
        createdAt,
        setup,
        random: this.random,
        ids: this.runtime.domainIds(),
      });
      if (!result.ok) {
        throw new DomainApplicationError(
          result.error.code,
          result.error.message,
        );
      }
      const revision = await this.makeRevision(
        result.value.nextState,
        null,
        this.runtime.commandId(),
        { type: "game.created" },
        result.value.summary,
      );
      const game = storedGameFromState(result.value.nextState);
      await this.repository.createGame(game, revision);
      await this.acquireControl(game.id);
      await this.refreshAfterDurableChange(game.id, revision.id);
    });
  }

  async resumeGame(id: GameId): Promise<void> {
    await this.enqueue(async () => {
      this.patch({ loading: true, error: null });
      try {
        await this.acquireControl(id);
        const loaded = await this.repository.resumeGame(id, this.runtime.now());
        this.applyLoadedGame(
          loaded,
          await this.repository.getRevisionHistory(id),
        );
        this.patch({ games: await this.repository.listGames() });
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  async dispatch(command: GameCommand): Promise<void> {
    await this.mutate(async () => {
      this.requireWritable();
      const state = this.requireActiveState();
      const game = this.requireActiveGame();
      const revisionId = this.runtime.revisionId();
      const at = this.runtime.now();
      const result = decide(state, command, {
        at,
        revisionId,
        random: this.random,
        ids: this.runtime.domainIds(),
      });
      if (!result.ok) {
        throw new DomainApplicationError(
          result.error.code,
          result.error.message,
        );
      }
      const commandId = this.runtime.commandId();
      const revision = await this.makeRevision(
        result.value.nextState,
        state.revisionId,
        commandId,
        command,
        result.value.summary,
      );
      await this.repository.commitRevision({
        gameId: game.id,
        expectedHeadRevisionId: state.revisionId,
        commandId,
        revision,
      });
      await this.refreshAfterDurableChange(game.id, revision.id);
    });
  }

  async undo(): Promise<void> {
    await this.moveHead("undo");
  }

  async redo(): Promise<void> {
    await this.moveHead("redo");
  }

  async archiveActive(): Promise<void> {
    await this.mutate(async () => {
      this.requireWritable();
      const game = this.requireActiveGame();
      await this.repository.archiveGame(game.id, this.runtime.now());
      await this.releaseControl();
      this.activeGame = null;
      this.patch({
        activeState: null,
        revisionHistory: [],
        canUndo: false,
        canRedo: false,
        games: await this.repository.listGames(),
        lastSavedAt: this.runtime.now(),
        readOnly: false,
      });
    });
  }

  async deleteGame(id: GameId): Promise<void> {
    await this.mutate(async () => {
      if (this.activeGame?.id === id) {
        this.requireWritable();
      }
      await this.repository.deleteGame(id);
      if (this.activeGame?.id === id) {
        await this.releaseControl();
        this.activeGame = null;
        this.patch({
          activeState: null,
          revisionHistory: [],
          canUndo: false,
          canRedo: false,
          readOnly: false,
        });
      }
      this.patch({ games: await this.repository.listGames() });
    });
  }

  async exportGame(id: GameId): Promise<ExportDocument> {
    return this.repository.exportGame(id, this.runtime.now());
  }

  async previewImport(input: unknown): Promise<ImportPreview> {
    return this.enqueue(async () => {
      this.patch({ loading: true, error: null });
      try {
        this.pendingImport = await this.repository.previewImport(input);
        this.patch({ importPreview: this.pendingImport.preview });
        return this.pendingImport.preview;
      } catch (error) {
        this.pendingImport = null;
        this.patch({ importPreview: null, error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  async confirmImport(): Promise<GameId> {
    return this.mutate(async () => {
      if (this.pendingImport === null) {
        throw persistenceError(
          "INVALID_IMPORT",
          "No validated import is pending.",
        );
      }
      const id = await this.repository.importGame(
        this.pendingImport,
        this.runtime,
      );
      await this.acquireControl(id);
      this.pendingImport = null;
      this.patch({ importPreview: null });
      await this.loadIntoSnapshot(id);
      return id;
    });
  }

  cancelImport(): void {
    this.pendingImport = null;
    this.patch({ importPreview: null });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  async recoverActive(): Promise<void> {
    await this.mutate(async () => {
      this.requireWritable();
      const game = this.activeGame;
      const recovery = this.snapshot.recovery;
      if (
        game === null ||
        recovery === null ||
        recovery.validAncestorRevisionId === null
      ) {
        throw persistenceError(
          "CORRUPT_GAME",
          "There is no verified recovery revision available.",
        );
      }
      const loaded = await this.repository.recoverGame({
        gameId: game.id,
        expectedInvalidHeadRevisionId: recovery.invalidHeadRevisionId,
        validAncestorRevisionId: recovery.validAncestorRevisionId,
        updatedAt: this.runtime.now(),
      });
      this.applyLoadedGame(
        loaded,
        await this.repository.getRevisionHistory(game.id),
      );
      this.patch({ games: await this.repository.listGames() });
    });
  }

  async refreshList(): Promise<void> {
    await this.enqueue(async () => {
      try {
        this.patch({ games: await this.repository.listGames(), error: null });
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      }
    });
  }

  async takeControl(): Promise<boolean> {
    return this.enqueue(async () => {
      const game = this.activeGame;
      if (game === null) {
        return false;
      }
      if (!this.snapshot.readOnly) {
        return true;
      }

      this.patch({ loading: true, error: null });
      try {
        const acquired = await this.acquireControl(game.id);
        if (acquired) {
          await this.loadIntoSnapshot(game.id);
        }
        return acquired;
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ loading: false });
      }
    });
  }

  dispose(): void {
    this.unsubscribeChannel?.();
    this.channel?.close();
    this.listeners.clear();
    void this.releaseControl();
  }

  private async moveHead(direction: "undo" | "redo"): Promise<void> {
    await this.mutate(async () => {
      this.requireWritable();
      const game = this.requireActiveGame();
      const state = this.requireActiveState();
      const loaded = await this.repository.moveHead({
        gameId: game.id,
        expectedHeadRevisionId: state.revisionId,
        direction,
        updatedAt: this.runtime.now(),
      });
      this.applyLoadedGame(
        loaded,
        await this.repository.getRevisionHistory(game.id),
      );
      this.channel?.post({
        type: "revision",
        tabId: this.tabId,
        gameId: game.id,
        revisionId: loaded.game.headRevisionId,
      });
    });
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
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

  private async refreshAfterDurableChange(
    gameId: GameId,
    revisionId: RevisionId,
  ): Promise<void> {
    await this.loadIntoSnapshot(gameId);
    this.patch({ lastSavedAt: this.snapshot.activeState?.updatedAt ?? null });
    this.channel?.post({
      type: "revision",
      tabId: this.tabId,
      gameId,
      revisionId,
    });
  }

  private async reloadActive(error: Error): Promise<void> {
    const id = this.activeGame?.id;
    if (id === undefined) {
      return;
    }
    await this.loadIntoSnapshot(id);
    this.patch({ error });
  }

  private async loadIntoSnapshot(id: GameId): Promise<void> {
    const loaded = await this.repository.loadGame(id);
    if (loaded === null) {
      throw persistenceError("NOT_FOUND", "Game was not found.");
    }
    const history = await this.repository.getRevisionHistory(id);
    this.applyLoadedGame(loaded, history);
    this.patch({ games: await this.repository.listGames() });
  }

  private applyLoadedGame(loaded: LoadedGame, history: StoredRevision[]): void {
    this.activeGame = loaded.game;
    const revision = loaded.revision;
    this.patch({
      activeState: revision?.state ?? null,
      revisionHistory: history,
      canUndo: revision !== null && revision.parentRevisionId !== null,
      canRedo: loaded.game.redoStack.length > 0,
      lastSavedAt: revision?.createdAt ?? null,
      error:
        loaded.recovery === null
          ? null
          : persistenceError(
              "CORRUPT_GAME",
              loaded.recovery.validAncestorRevisionId === null
                ? "The game is corrupt and has no valid recovery revision."
                : "The current revision is corrupt; a valid ancestor is available for recovery.",
              {
                invalidHeadRevisionId: loaded.recovery.invalidHeadRevisionId,
                validAncestorRevisionId:
                  loaded.recovery.validAncestorRevisionId,
              },
            ),
      recovery: loaded.recovery,
    });
  }

  private async makeRevision(
    state: GameState,
    parentRevisionId: RevisionId | null,
    commandId: StoredRevision["commandId"],
    command: StoredRevision["command"],
    summary: JournalSummary,
  ): Promise<StoredRevision> {
    const errors = validateGameState(state);
    if (errors.length > 0) {
      throw new DomainApplicationError(
        errors[0]?.code ?? "INVARIANT_VIOLATION",
        errors[0]?.message ?? "The resulting game state is invalid.",
      );
    }
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

  private requireActiveGame(): StoredGame {
    if (this.activeGame === null) {
      throw persistenceError("NOT_FOUND", "There is no active game.");
    }
    if (this.activeGame.lifecycle !== "active") {
      throw persistenceError(
        "CORRUPT_GAME",
        "This game is not available for mutation.",
      );
    }
    return this.activeGame;
  }

  private requireActiveState(): GameState {
    if (this.snapshot.activeState === null) {
      throw persistenceError("NOT_FOUND", "There is no active game state.");
    }
    return this.snapshot.activeState;
  }

  private requireWritable(): void {
    if (this.snapshot.readOnly) {
      throw persistenceError(
        "REVISION_CONFLICT",
        "This game is controlled by another tab.",
      );
    }
  }

  private async acquireControl(id: GameId): Promise<boolean> {
    if (!this.control) {
      this.patch({ readOnly: false });
      return true;
    }
    await this.control.release();
    const acquired = await this.control.acquire(id);
    this.patch({ readOnly: !acquired });
    return acquired;
  }

  private async releaseControl(): Promise<void> {
    await this.control?.release();
    this.patch({ readOnly: false });
  }

  private patch(changes: Partial<ControllerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export class DomainApplicationError extends Error {
  readonly name = "DomainApplicationError";

  constructor(
    readonly code: string,
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
    "An unknown error occurred.",
  );
}
