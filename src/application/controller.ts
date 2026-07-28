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
import {
  PersistenceError,
  isPersistenceError,
  persistenceError,
} from "./errors";
import type { GameChannel } from "./broadcast";
import type { GameControl } from "./control";
import type {
  ExportDocument,
  GameRepository,
  ImportPreview,
  LoadedGame,
  RecoveryInformation,
  RevisionCommit,
  StoredGame,
  StoredRevision,
  ValidatedImport,
} from "./persistence";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from "./persistence";
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
  pendingSave: PendingSaveInformation | null;
}

export interface PendingSaveInformation {
  revisionId: RevisionId;
  commandType: StoredRevision["command"]["type"];
  createdAt: string;
  message: string;
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
    pendingSave: null,
    lastSavedAt: null,
    importPreview: null,
  };
  private readonly listeners = new Set<() => void>();
  private mutationTail: Promise<void> = Promise.resolve();
  private activeGame: StoredGame | null = null;
  private pendingImport: ValidatedImport | null = null;
  private pendingCommit: RevisionCommit | null = null;
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
      await this.archiveCurrentForReplacement(createdAt);
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
    await this.mutate(async () => {
      this.patch({ loading: true, error: null });
      try {
        const target = await this.repository.loadGame(id);
        if (target === null) {
          throw persistenceError("NOT_FOUND", "Game was not found.");
        }
        const at = this.runtime.now();
        if (this.activeGame !== null && this.activeGame.id !== id) {
          await this.archiveCurrentForReplacement(at);
        }
        await this.acquireControl(id);
        const loaded = await this.repository.resumeGame(id, at);
        this.applyLoadedGame(
          loaded,
          await this.repository.getRevisionHistory(id),
        );
        if (
          target.game.lifecycle === "archived" &&
          loaded.recovery === null &&
          loaded.revision?.state.status === "active" &&
          !this.snapshot.readOnly
        ) {
          await this.resumeArchivedClock(target.game.updatedAt, at);
        }
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
      await this.commitActiveCommand(command, this.runtime.now());
    });
  }

  /**
   * Steps back past the current roll, not just one revision.
   *
   * A roll spans several revisions: the draw, acknowledging the result, and any
   * event it triggered. Undoing one of those leaves the table mid-action — dice
   * on screen waiting to be confirmed — which reads as "undo did nothing" and
   * hides the option the player actually wanted, like using Alchemy instead.
   *
   * Only the roll and what it triggered are grouped. Bookkeeping entered by
   * hand afterwards — correcting a score, fixing a metropolis holder — stays
   * individually undoable, because those are separate mistakes with separate
   * corrections, and folding them into a roll-sized undo would take back work
   * the table never asked to lose.
   *
   * Redo remains single-step: replaying a whole roll blind would be worse than
   * stepping forward deliberately.
   */
  async undo(): Promise<void> {
    const steps = this.revisionsToUndo();
    for (let step = 0; step < steps; step += 1) {
      await this.moveHead("undo");
    }
  }

  async redo(): Promise<void> {
    await this.moveHead("redo");
  }

  /**
   * How many revisions a single undo should unwind.
   *
   * Returns the size of the roll group when the head sits on a roll or on
   * something that roll put on screen, and 1 for anything else. Never returns
   * 0, so undo always moves.
   */
  private revisionsToUndo(): number {
    const history = this.snapshot.revisionHistory;
    const head = this.snapshot.activeState?.revisionId;
    if (head === undefined || history.length === 0) {
      return 1;
    }
    const headIndex = history.findIndex((revision) => revision.id === head);
    if (headIndex <= 0) {
      return 1;
    }

    // What a roll can put on screen before the table can act again.
    const rollFollowUp = new Set([
      "resolution-acknowledged",
      "thematic-event-acknowledged",
      "thematic-event-resolved",
    ]);

    let steps = 0;
    for (let index = headIndex; index > 0; index -= 1) {
      const kind = history[index]?.summary.kind ?? "";
      if (kind === "roll-drawn") {
        return steps + 1;
      }
      if (!rollFollowUp.has(kind)) {
        break;
      }
      steps += 1;
    }
    return 1;
  }

  async archiveActive(): Promise<void> {
    await this.mutate(async () => {
      this.requireWritable();
      const at = this.runtime.now();
      await this.pauseActiveClock(at);
      const game = this.requireActiveGame();
      await this.repository.archiveGame(game.id, at);
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
      const sourceGame = this.pendingImport.document.game;
      const importedAt = this.runtime.now();
      await this.archiveCurrentForReplacement(importedAt);
      const id = await this.repository.importGame(
        this.pendingImport,
        this.runtime,
      );
      await this.acquireControl(id);
      this.pendingImport = null;
      this.patch({ importPreview: null });
      const loaded = await this.repository.resumeGame(id, importedAt);
      this.applyLoadedGame(
        loaded,
        await this.repository.getRevisionHistory(id),
      );
      if (
        sourceGame.lifecycle === "archived" &&
        loaded.recovery === null &&
        loaded.revision?.state.status === "active" &&
        !this.snapshot.readOnly
      ) {
        await this.resumeArchivedClock(sourceGame.updatedAt, importedAt);
      }
      this.patch({ games: await this.repository.listGames() });
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

  async retryPendingSave(): Promise<void> {
    await this.mutate(async () => {
      const pending = this.requirePendingCommit();
      await this.repository.commitRevision(pending);
      this.clearPendingCommit();
      await this.refreshAfterDurableChange(pending.gameId, pending.revision.id);
    }, true);
  }

  async exportPendingSave(): Promise<ExportDocument> {
    return this.enqueue(async () => {
      const pending = this.requirePendingCommit();
      const exportedAt = this.runtime.now();
      const durable = await this.repository.exportGame(
        pending.gameId,
        exportedAt,
      );
      if (durable.game.headRevisionId === pending.revision.id) {
        return durable;
      }
      if (durable.game.headRevisionId !== pending.expectedHeadRevisionId) {
        throw persistenceError(
          "REVISION_CONFLICT",
          "The game changed before the emergency backup was created.",
        );
      }

      const candidateGame = {
        ...storedGameFromState(
          pending.revision.state,
          pending.revision.state.status,
        ),
        createdAt: durable.game.createdAt,
      };
      const unsigned = {
        format: EXPORT_FORMAT as typeof EXPORT_FORMAT,
        exportVersion: EXPORT_VERSION as typeof EXPORT_VERSION,
        exportedAt,
        applicationVersion: APPLICATION_VERSION,
        game: candidateGame,
        activeBranch: [...durable.activeBranch, pending.revision],
        ...(durable.optionalBranches === undefined
          ? {}
          : { optionalBranches: durable.optionalBranches }),
        integrity: { algorithm: "SHA-256" as const },
      };
      return {
        ...unsigned,
        integrity: {
          algorithm: "SHA-256",
          documentHash: await sha256(unsigned),
        },
      };
    });
  }

  async revertPendingSave(): Promise<void> {
    await this.mutate(async () => {
      const pending = this.requirePendingCommit();
      const loaded = await this.repository.loadGame(pending.gameId);
      if (loaded === null) {
        throw persistenceError("NOT_FOUND", "Game was not found.");
      }

      let reverted = loaded;
      if (loaded.game.headRevisionId === pending.revision.id) {
        reverted = await this.repository.moveHead({
          gameId: pending.gameId,
          expectedHeadRevisionId: pending.revision.id,
          direction: "undo",
          updatedAt: this.runtime.now(),
        });
      } else if (
        loaded.game.headRevisionId !== pending.expectedHeadRevisionId
      ) {
        this.clearPendingCommit();
        this.applyLoadedGame(
          loaded,
          await this.repository.getRevisionHistory(pending.gameId),
        );
        this.patch({
          games: await this.repository.listGames(),
          error: persistenceError(
            "REVISION_CONFLICT",
            "The game changed in another tab; the failed action was discarded.",
          ),
        });
        return;
      }

      this.clearPendingCommit();
      this.applyLoadedGame(
        reverted,
        await this.repository.getRevisionHistory(pending.gameId),
      );
      this.patch({
        games: await this.repository.listGames(),
        error: null,
      });
    }, true);
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

  private async mutate<T>(
    operation: () => Promise<T>,
    allowPendingSave = false,
  ): Promise<T> {
    return this.enqueue(async () => {
      this.patch({ saving: true, error: null });
      try {
        if (!allowPendingSave) {
          this.requireNoPendingSave();
        }
        return await operation();
      } catch (error) {
        this.patch({ error: normalizeError(error) });
        throw error;
      } finally {
        this.patch({ saving: false });
      }
    });
  }

  private async commitActiveCommand(
    command: GameCommand,
    at: GameState["updatedAt"],
  ): Promise<StoredRevision> {
    this.requireWritable();
    const state = this.requireActiveState();
    const game = this.requireActiveGame();
    const revisionId = this.runtime.revisionId();
    const result = decide(state, command, {
      at,
      revisionId,
      random: this.random,
      ids: this.runtime.domainIds(),
    });
    if (!result.ok) {
      throw new DomainApplicationError(result.error.code, result.error.message);
    }
    const commandId = this.runtime.commandId();
    const revision = await this.makeRevision(
      result.value.nextState,
      state.revisionId,
      commandId,
      command,
      result.value.summary,
    );
    const commit = {
      gameId: game.id,
      expectedHeadRevisionId: state.revisionId,
      commandId,
      revision,
    };
    try {
      await this.repository.commitRevision(commit);
    } catch (error) {
      if (shouldRetainPendingSave(error)) {
        this.pendingCommit = commit;
        this.patch({
          pendingSave: {
            revisionId: revision.id,
            commandType: command.type,
            createdAt: revision.createdAt,
            message: normalizeError(error).message,
          },
        });
      }
      throw error;
    }
    this.clearPendingCommit();
    await this.refreshAfterDurableChange(game.id, revision.id);
    return revision;
  }

  private async pauseActiveClock(at: GameState["updatedAt"]): Promise<void> {
    const state = this.snapshot.activeState;
    if (
      state?.status === "active" &&
      state.clock !== undefined &&
      state.clock.runningSince !== null
    ) {
      await this.commitActiveCommand({ type: "clock.paused" }, at);
    }
  }

  private async archiveCurrentForReplacement(
    at: GameState["updatedAt"],
  ): Promise<void> {
    if (this.activeGame === null) {
      return;
    }
    if (this.activeGame.lifecycle !== "active") {
      await this.releaseControl();
      this.activeGame = null;
      this.patch({
        activeState: null,
        revisionHistory: [],
        canUndo: false,
        canRedo: false,
        recovery: null,
      });
      return;
    }
    this.requireWritable();
    await this.pauseActiveClock(at);
    const game = this.requireActiveGame();
    await this.repository.archiveGame(game.id, at);
    await this.releaseControl();
    this.activeGame = null;
    this.patch({
      activeState: null,
      revisionHistory: [],
      canUndo: false,
      canRedo: false,
      recovery: null,
    });
  }

  private async resumeArchivedClock(
    archivedAt: GameState["updatedAt"],
    resumedAt: GameState["updatedAt"],
  ): Promise<void> {
    let state = this.snapshot.activeState;
    if (state?.status !== "active" || state.clock === undefined) {
      return;
    }
    if (state.clock.runningSince !== null) {
      await this.commitActiveCommand({ type: "clock.paused" }, archivedAt);
      state = this.snapshot.activeState;
    }
    if (
      state?.clock?.pausedAt !== null &&
      state?.clock?.pausedAt !== undefined
    ) {
      await this.commitActiveCommand({ type: "clock.resumed" }, resumedAt);
    }
  }

  private requirePendingCommit(): RevisionCommit {
    if (this.pendingCommit === null) {
      throw persistenceError(
        "NOT_FOUND",
        "There is no failed save to resolve.",
      );
    }
    return this.pendingCommit;
  }

  private requireNoPendingSave(): void {
    if (this.pendingCommit !== null) {
      throw persistenceError(
        "TRANSACTION_FAILED",
        "Resolve the failed save before making another change.",
      );
    }
  }

  private clearPendingCommit(): void {
    this.pendingCommit = null;
    this.patch({ pendingSave: null });
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
    if (this.control !== undefined && !this.control.hasControl(id)) {
      this.patch({ readOnly: true });
    }
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
    const lostControl =
      this.control !== undefined &&
      this.activeGame !== null &&
      !this.control.hasControl(this.activeGame.id);
    if (this.snapshot.readOnly || lostControl) {
      if (lostControl) {
        this.patch({ readOnly: true });
      }
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

function shouldRetainPendingSave(error: unknown): boolean {
  return (
    !isPersistenceError(error) ||
    error.code === "STORAGE_UNAVAILABLE" ||
    error.code === "TRANSACTION_FAILED"
  );
}
