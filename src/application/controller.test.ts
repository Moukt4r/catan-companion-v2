import { describe, expect, it, vi } from "vitest";
import {
  asCommandId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  decide,
} from "../domain";
import type {
  CommandId,
  GameCommand,
  GameId,
  GameSetup,
  GameState,
  IdSource,
  IsoTimestamp,
  JournalSummary,
  RevisionId,
} from "../domain";
import type { GameChannel, GameChannelMessage } from "./broadcast";
import type { GameControl } from "./control";
import { DomainApplicationError, GameController } from "./controller";
import { persistenceError } from "./errors";
import { sha256 } from "./integrity";
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
} from "./persistence";
import {
  APPLICATION_VERSION,
  DATABASE_SCHEMA_VERSION,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from "./persistence";
import { storedGameFromState } from "./records";
import type { RuntimeDependencies } from "./runtime";

describe("GameController", () => {
  it("initializes without an active game, publishes presence, and notifies subscribers", async () => {
    const repository = new MemoryRepository();
    const channel = new TestChannel();
    const control = new TestControl();
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("empty"),
      channel,
      control,
    );
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      initialized: true,
      loading: false,
      activeState: null,
      games: [],
      readOnly: false,
    });
    expect(control.release).toHaveBeenCalledOnce();
    expect(channel.posts[0]).toMatchObject({ type: "presence" });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("loads an active game read-only and supports an explicit takeover", async () => {
    const repository = new MemoryRepository();
    const created = await fixture("readonly");
    repository.seed(created.game, created.revision);
    const control = new TestControl(false);
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("readonly"),
      undefined,
      control,
    );

    await controller.initialize();

    expect(controller.getSnapshot()).toMatchObject({
      activeState: created.state,
      canUndo: false,
      canRedo: false,
      readOnly: true,
    });
    await expect(
      controller.dispatch({ type: "roll.draw" }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(controller.getSnapshot().error).toMatchObject({
      code: "REVISION_CONFLICT",
    });

    control.allowed = true;
    await expect(controller.takeControl()).resolves.toBe(true);
    expect(controller.getSnapshot().readOnly).toBe(false);
  });

  it("serializes duplicate takeover requests without releasing a newly acquired lock", async () => {
    const repository = new MemoryRepository();
    const created = await fixture("takeover-race");
    repository.seed(created.game, created.revision);
    const control = new TestControl(false);
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("takeover-race"),
      undefined,
      control,
    );
    await controller.initialize();

    let resolveAcquire!: (allowed: boolean) => void;
    const acquisition = new Promise<boolean>((resolve) => {
      resolveAcquire = resolve;
    });
    control.acquire.mockImplementation(() => acquisition);

    const first = controller.takeControl();
    const second = controller.takeControl();

    await vi.waitFor(() => {
      expect(control.acquire).toHaveBeenCalledTimes(2);
    });
    expect(controller.getSnapshot().loading).toBe(true);

    resolveAcquire(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(control.acquire).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      readOnly: false,
    });
  });

  it("starts, dispatches, and serializes mutations while surfacing domain failures", async () => {
    const repository = new MemoryRepository();
    const channel = new TestChannel();
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("mutations"),
      channel,
    );
    await controller.initialize();
    await controller.startGame(setup());

    const results = await Promise.allSettled([
      controller.dispatch({ type: "roll.draw" }),
      controller.dispatch({ type: "roll.draw" }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    const reason: unknown =
      rejected?.status === "rejected" ? rejected.reason : null;
    expect(reason).toBeInstanceOf(DomainApplicationError);
    expect(controller.getSnapshot()).toMatchObject({
      saving: false,
      canUndo: true,
    });
    expect(controller.getSnapshot().activeState?.statistics.totalRolls).toBe(1);
    expect(controller.getSnapshot().revisionHistory).toHaveLength(2);
    expect(
      channel.posts.filter((message) => message.type === "revision"),
    ).toHaveLength(2);
  });

  it("resumes, archives, exports, and deletes games", async () => {
    const repository = new MemoryRepository();
    const first = await fixture("lifecycle-first", "archived");
    const second = await fixture("lifecycle-second", "archived");
    repository.seed(first.game, first.revision);
    repository.seed(second.game, second.revision);
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("lifecycle"),
      undefined,
      new TestControl(),
    );
    await controller.initialize();

    await controller.resumeGame(first.game.id);
    expect(controller.getSnapshot().activeState?.id).toBe(first.game.id);
    await expect(controller.exportGame(first.game.id)).resolves.toMatchObject({
      format: EXPORT_FORMAT,
      game: { id: first.game.id },
    });

    await controller.archiveActive();
    expect(controller.getSnapshot().activeState).toBeNull();
    expect(repository.games.get(first.game.id)?.lifecycle).toBe("archived");

    await controller.deleteGame(second.game.id);
    expect(repository.games.has(second.game.id)).toBe(false);
    await controller.resumeGame(first.game.id);
    await controller.deleteGame(first.game.id);
    expect(controller.getSnapshot()).toMatchObject({
      activeState: null,
      revisionHistory: [],
      readOnly: false,
    });
  });

  it("previews, cancels, confirms, and rejects imports", async () => {
    const repository = new MemoryRepository();
    const imported = await fixture("imported", "archived");
    repository.seed(imported.game, imported.revision);
    repository.importCandidate = validatedImport(imported);
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("imports"),
    );
    await controller.initialize();

    await expect(controller.confirmImport()).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });
    controller.clearError();
    expect(controller.getSnapshot().error).toBeNull();

    await expect(
      controller.previewImport({ valid: true }),
    ).resolves.toMatchObject({
      title: imported.game.title,
    });
    expect(controller.getSnapshot().importPreview).not.toBeNull();
    controller.cancelImport();
    expect(controller.getSnapshot().importPreview).toBeNull();

    repository.previewFailure = persistenceError(
      "INVALID_IMPORT",
      "bad backup",
    );
    await expect(
      controller.previewImport({ invalid: true }),
    ).rejects.toMatchObject({
      code: "INVALID_IMPORT",
    });
    expect(controller.getSnapshot()).toMatchObject({
      loading: false,
      importPreview: null,
      error: repository.previewFailure,
    });

    repository.previewFailure = null;
    await controller.previewImport({ valid: true });
    await expect(controller.confirmImport()).resolves.toBe(imported.game.id);
    expect(controller.getSnapshot()).toMatchObject({
      activeState: imported.state,
      importPreview: null,
    });
  });

  it("undoes, redoes, and broadcasts moved heads", async () => {
    const repository = new MemoryRepository();
    const channel = new TestChannel();
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("history"),
      channel,
    );
    await controller.initialize();
    await controller.startGame(setup());
    await controller.dispatch({ type: "roll.draw" });
    const rolledRevisionId = controller.getSnapshot().activeState?.revisionId;

    await controller.undo();
    expect(controller.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: true,
    });
    await controller.redo();
    expect(controller.getSnapshot().activeState?.revisionId).toBe(
      rolledRevisionId,
    );
    expect(channel.posts.at(-1)).toMatchObject({ type: "revision" });
  });

  it("exposes recovery state, rejects unavailable recovery, and recovers an ancestor", async () => {
    const repository = new MemoryRepository();
    const root = await fixture("recovery");
    const child = await nextFixture(root, "recovery-child");
    repository.seed(child.game, root.revision, child.revision);
    repository.recoveries.set(child.game.id, {
      invalidHeadRevisionId: child.revision.id,
      validAncestorRevisionId: root.revision.id,
      invalidRevisionIds: [child.revision.id],
    });
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("recovery"),
    );

    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({
      activeState: root.state,
      recovery: {
        validAncestorRevisionId: root.revision.id,
      },
      error: { code: "CORRUPT_GAME" },
    });
    await controller.recoverActive();
    expect(controller.getSnapshot()).toMatchObject({
      activeState: root.state,
      recovery: null,
      error: null,
    });

    await expect(controller.recoverActive()).rejects.toMatchObject({
      code: "CORRUPT_GAME",
    });
  });

  it("reloads an active game after another tab broadcasts a revision", async () => {
    const repository = new MemoryRepository();
    const root = await fixture("broadcast");
    repository.seed(root.game, root.revision);
    const channel = new TestChannel();
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("local-tab"),
      channel,
    );
    await controller.initialize();
    const child = await nextFixture(root, "broadcast-child");
    repository.seed(child.game, root.revision, child.revision);

    channel.emit({
      type: "revision",
      tabId: "local-tab-command-1",
      gameId: root.game.id,
      revisionId: child.revision.id,
    });
    channel.emit({
      type: "revision",
      tabId: "other-tab",
      gameId: asGameId("different-game"),
      revisionId: child.revision.id,
    });
    expect(controller.getSnapshot().activeState?.revisionId).toBe(
      root.revision.id,
    );

    channel.emit({
      type: "revision",
      tabId: "other-tab",
      gameId: root.game.id,
      revisionId: child.revision.id,
    });
    await vi.waitFor(() => {
      expect(controller.getSnapshot().activeState?.revisionId).toBe(
        child.revision.id,
      );
    });
    expect(controller.getSnapshot().error).toMatchObject({
      code: "REVISION_CONFLICT",
    });
  });

  it("normalizes unknown failures, handles missing loads, and clears errors", async () => {
    const repository = new MemoryRepository();
    vi.spyOn(repository, "listGames").mockRejectedValueOnce("not an Error");
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("errors"),
    );

    await expect(controller.initialize()).rejects.toBe("not an Error");
    expect(controller.getSnapshot()).toMatchObject({
      initialized: false,
      loading: false,
      error: {
        name: "PersistenceError",
        code: "TRANSACTION_FAILED",
      },
    });
    controller.clearError();
    expect(controller.getSnapshot().error).toBeNull();

    const missing = await fixture("missing");
    repository.games.set(missing.game.id, missing.game);
    repository.missingLoads.add(missing.game.id);
    await expect(controller.initialize()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns false without an active game and disposes channel, control, and listeners", async () => {
    const repository = new MemoryRepository();
    const channel = new TestChannel();
    const control = new TestControl();
    const controller = new GameController(
      repository,
      { nextUint32: () => 0 },
      runtime("dispose"),
      channel,
      control,
    );
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.initialize();

    await expect(controller.takeControl()).resolves.toBe(false);
    controller.dispose();
    await vi.waitFor(() => {
      expect(control.release).toHaveBeenCalledTimes(2);
    });
    expect(channel.closed).toBe(true);
    expect(channel.listenerCount).toBe(0);
  });
});

class TestChannel implements GameChannel {
  readonly posts: GameChannelMessage[] = [];
  private readonly listeners = new Set<(message: GameChannelMessage) => void>();
  closed = false;

  get listenerCount(): number {
    return this.listeners.size;
  }

  post(message: GameChannelMessage): void {
    this.posts.push(message);
  }

  subscribe(listener: (message: GameChannelMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(message: GameChannelMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

class TestControl implements GameControl {
  constructor(public allowed = true) {}

  readonly acquire = vi.fn(() => Promise.resolve(this.allowed));
  readonly release = vi.fn(() => Promise.resolve());
}

class MemoryRepository implements GameRepository {
  readonly games = new Map<GameId, StoredGame>();
  readonly revisions = new Map<GameId, StoredRevision[]>();
  readonly recoveries = new Map<GameId, RecoveryInformation>();
  readonly missingLoads = new Set<GameId>();
  previewFailure: Error | null = null;
  importCandidate: ValidatedImport | null = null;

  seed(game: StoredGame, ...revisions: StoredRevision[]): void {
    this.games.set(game.id, game);
    this.revisions.set(game.id, revisions);
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  listGames(): Promise<StoredGame[]> {
    return Promise.resolve(
      [...this.games.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    );
  }

  loadGame(id: GameId): Promise<LoadedGame | null> {
    if (this.missingLoads.has(id)) return Promise.resolve(null);
    const game = this.games.get(id);
    if (!game) return Promise.resolve(null);
    const history = this.revisions.get(id) ?? [];
    const recovery = this.recoveries.get(id) ?? null;
    const revisionId = recovery?.validAncestorRevisionId ?? game.headRevisionId;
    return Promise.resolve({
      game,
      revision: history.find((revision) => revision.id === revisionId) ?? null,
      recovery,
    });
  }

  async resumeGame(id: GameId, at: IsoTimestamp): Promise<LoadedGame> {
    const loaded = await this.loadGame(id);
    if (!loaded) throw persistenceError("NOT_FOUND", "Game was not found.");
    for (const [gameId, game] of this.games) {
      if (game.lifecycle === "active" && gameId !== id) {
        this.games.set(gameId, {
          ...game,
          lifecycle: "archived",
          updatedAt: at,
        });
      }
    }
    const resumed = {
      ...loaded.game,
      lifecycle: "active" as const,
      updatedAt: at,
    };
    this.games.set(id, resumed);
    return { ...loaded, game: resumed };
  }

  getRevisionHistory(id: GameId): Promise<StoredRevision[]> {
    return Promise.resolve(this.revisions.get(id) ?? []);
  }

  createGame(game: StoredGame, revision: StoredRevision): Promise<void> {
    for (const [id, existing] of this.games) {
      if (existing.lifecycle === "active") {
        this.games.set(id, { ...existing, lifecycle: "archived" });
      }
    }
    this.seed(game, revision);
    return Promise.resolve();
  }

  commitRevision(input: RevisionCommit): Promise<StoredRevision> {
    const game = this.games.get(input.gameId);
    if (!game) throw persistenceError("NOT_FOUND", "Game was not found.");
    if (game.headRevisionId !== input.expectedHeadRevisionId) {
      throw persistenceError("REVISION_CONFLICT", "Head changed.");
    }
    const history = this.revisions.get(input.gameId) ?? [];
    this.revisions.set(input.gameId, [...history, input.revision]);
    this.games.set(input.gameId, {
      ...storedGameFromState(input.revision.state),
      latestRevisionId: input.revision.id,
      redoStack: [],
    });
    return Promise.resolve(input.revision);
  }

  moveHead(input: HeadMove): Promise<LoadedGame> {
    const game = this.games.get(input.gameId);
    if (!game) throw persistenceError("NOT_FOUND", "Game was not found.");
    if (game.headRevisionId !== input.expectedHeadRevisionId) {
      throw persistenceError("REVISION_CONFLICT", "Head changed.");
    }
    const history = this.revisions.get(input.gameId) ?? [];
    const current = history.find(
      (revision) => revision.id === game.headRevisionId,
    );
    if (!current) throw persistenceError("CORRUPT_GAME", "Missing revision.");
    const targetId =
      input.direction === "undo"
        ? current.parentRevisionId
        : game.redoStack.at(-1);
    const target = history.find((revision) => revision.id === targetId);
    if (!target) throw persistenceError("NOT_FOUND", "No revision.");
    const redoStack =
      input.direction === "undo"
        ? [...game.redoStack, current.id]
        : game.redoStack.slice(0, -1);
    const moved = {
      ...storedGameFromState(target.state),
      latestRevisionId: game.latestRevisionId,
      redoStack,
      updatedAt: input.updatedAt,
    };
    this.games.set(input.gameId, moved);
    return Promise.resolve({ game: moved, revision: target, recovery: null });
  }

  recoverGame(input: RecoveryRequest): Promise<LoadedGame> {
    const game = this.games.get(input.gameId);
    const target = this.revisions
      .get(input.gameId)
      ?.find((revision) => revision.id === input.validAncestorRevisionId);
    if (!game || !target) {
      throw persistenceError("CORRUPT_GAME", "Recovery failed.");
    }
    const recovered = {
      ...storedGameFromState(target.state),
      latestRevisionId: game.latestRevisionId,
      redoStack: [],
      updatedAt: input.updatedAt,
    };
    this.games.set(input.gameId, recovered);
    this.recoveries.delete(input.gameId);
    return Promise.resolve({
      game: recovered,
      revision: target,
      recovery: null,
    });
  }

  archiveGame(id: GameId, at: IsoTimestamp): Promise<void> {
    const game = this.games.get(id);
    if (!game) throw persistenceError("NOT_FOUND", "Game was not found.");
    this.games.set(id, { ...game, lifecycle: "archived", updatedAt: at });
    return Promise.resolve();
  }

  deleteGame(id: GameId): Promise<void> {
    this.games.delete(id);
    this.revisions.delete(id);
    return Promise.resolve();
  }

  exportGame(id: GameId, exportedAt: IsoTimestamp): Promise<ExportDocument> {
    const game = this.games.get(id);
    if (!game) throw persistenceError("NOT_FOUND", "Game was not found.");
    return Promise.resolve({
      format: EXPORT_FORMAT,
      exportVersion: EXPORT_VERSION,
      exportedAt,
      applicationVersion: APPLICATION_VERSION,
      game,
      activeBranch: this.revisions.get(id) ?? [],
      integrity: {
        algorithm: "SHA-256",
        documentHash: "0".repeat(64),
      },
    });
  }

  previewImport(): Promise<ValidatedImport> {
    if (this.previewFailure) throw this.previewFailure;
    if (!this.importCandidate) {
      throw persistenceError("INVALID_IMPORT", "No import configured.");
    }
    return Promise.resolve(this.importCandidate);
  }

  importGame(input: ValidatedImport, ids: ImportIdSource): Promise<GameId> {
    void ids;
    return Promise.resolve(input.document.game.id);
  }
}

interface Fixture {
  game: StoredGame;
  revision: StoredRevision;
  state: GameState;
}

async function fixture(
  prefix: string,
  lifecycle: StoredGame["lifecycle"] = "active",
): Promise<Fixture> {
  const result = createGame({
    gameId: asGameId(`${prefix}-game`),
    revisionId: asRevisionId(`${prefix}-revision-1`),
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
    state: result.value.nextState,
    revision,
    game: storedGameFromState(result.value.nextState, lifecycle),
  };
}

async function nextFixture(parent: Fixture, prefix: string): Promise<Fixture> {
  const command: GameCommand = { type: "roll.draw" };
  const result = decide(parent.state, command, {
    at: asIsoTimestamp("2026-07-12T12:01:00.000Z"),
    revisionId: asRevisionId(`${prefix}-revision-2`),
    random: () => 0,
    ids: ids(prefix),
  });
  if (!result.ok) throw new Error(result.error.message);
  const revision = await makeRevision(
    result.value.nextState,
    parent.revision.id,
    command,
    result.value.summary,
  );
  return {
    state: result.value.nextState,
    revision,
    game: {
      ...storedGameFromState(result.value.nextState),
      latestRevisionId: revision.id,
      redoStack: [],
    },
  };
}

async function makeRevision(
  state: GameState,
  parentRevisionId: RevisionId | null,
  command: StoredRevision["command"],
  summary: JournalSummary,
): Promise<StoredRevision> {
  return {
    id: state.revisionId,
    gameId: state.id,
    parentRevisionId,
    sequence: state.revisionNumber,
    commandId: asCommandId(`command-${state.revisionId}`),
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

function validatedImport(value: Fixture): ValidatedImport {
  return {
    document: {
      format: EXPORT_FORMAT,
      exportVersion: EXPORT_VERSION,
      exportedAt: asIsoTimestamp("2026-07-12T15:00:00.000Z"),
      applicationVersion: APPLICATION_VERSION,
      game: value.game,
      activeBranch: [value.revision],
      integrity: {
        algorithm: "SHA-256",
        documentHash: "0".repeat(64),
      },
    },
    revisions: [value.revision],
    preview: {
      title: value.game.title,
      playerNames: value.game.players.map((player) => player.name),
      createdAt: value.game.createdAt,
      updatedAt: value.game.updatedAt,
      revisionCount: 1,
      completedTurns: 0,
      sourceApplicationVersion: APPLICATION_VERSION,
      sourceDocumentVersion: value.game.gameDocumentVersion,
    },
  };
}

function setup(): GameSetup {
  const players = ["a", "b", "c"].map((suffix, index) => ({
    id: asPlayerId(`controller-player-${suffix}`),
    name: `Player ${suffix}`,
    color: {
      id: `controller-color-${suffix}`,
      label: `Color ${suffix}`,
      hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
      distinguishabilityKey: `controller-key-${suffix}`,
    },
  }));
  return {
    title: "Controller test",
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

function ids(prefix: string): IdSource {
  let value = 0;
  return {
    next(kind) {
      value += 1;
      return `${prefix}-${kind}-${value}`;
    },
  };
}

function runtime(prefix: string): RuntimeDependencies {
  let value = 0;
  const next = () => {
    value += 1;
    return value;
  };
  return {
    gameId(): GameId {
      return asGameId(`${prefix}-game-${next()}`);
    },
    revisionId(): RevisionId {
      return asRevisionId(`${prefix}-revision-${next()}`);
    },
    commandId(): CommandId {
      return asCommandId(`${prefix}-command-${next()}`);
    },
    now(): IsoTimestamp {
      return asIsoTimestamp(
        `2026-07-12T12:00:${String(next()).padStart(2, "0")}.000Z`,
      );
    },
    domainIds(): IdSource {
      return { next: (kind) => `${prefix}-${kind}-${next()}` };
    },
  };
}
