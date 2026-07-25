import type {
  CommandId,
  GameCommand,
  GameId,
  GameState,
  IsoTimestamp,
  JournalSummary,
  PlayerId,
  RevisionId,
} from "../domain";

export const APPLICATION_VERSION = "0.6.1";
export const DATABASE_SCHEMA_VERSION = 1;
export const EXPORT_VERSION = 1;
export const EXPORT_FORMAT = "catan-table-companion";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type GameLifecycle = "active" | "completed" | "archived" | "corrupt";

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  colorHex: string;
  score: number;
}

export interface CurrentTurnSummary {
  playerId: PlayerId;
  playerName: string;
  round: number;
  turnNumber: number;
  phase: GameState["turn"]["phase"];
}

export interface StoredGame {
  id: GameId;
  lifecycle: GameLifecycle;
  title: string;
  headRevisionId: RevisionId;
  latestRevisionId: RevisionId;
  redoStack: RevisionId[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  winnerId?: PlayerId;
  players: PlayerSummary[];
  currentTurn: CurrentTurnSummary;
  gameDocumentVersion: number;
  rulesDataVersion: string;
}

export type PersistedCommand = { type: "game.created" } | GameCommand;

export interface StoredRevision {
  id: RevisionId;
  gameId: GameId;
  parentRevisionId: RevisionId | null;
  sequence: number;
  commandId: CommandId;
  command: PersistedCommand;
  summary: JournalSummary;
  state: GameState;
  stateHash: string;
  createdAt: IsoTimestamp;
  applicationVersion: string;
  databaseSchemaVersion: number;
  gameDocumentVersion: number;
  rulesDataVersion: string;
}

export interface RecoveryInformation {
  invalidHeadRevisionId: RevisionId;
  validAncestorRevisionId: RevisionId | null;
  invalidRevisionIds: RevisionId[];
}

export interface LoadedGame {
  game: StoredGame;
  revision: StoredRevision | null;
  recovery: RecoveryInformation | null;
}

export interface RevisionCommit {
  gameId: GameId;
  expectedHeadRevisionId: RevisionId;
  commandId: CommandId;
  revision: StoredRevision;
}

export interface HeadMove {
  gameId: GameId;
  expectedHeadRevisionId: RevisionId;
  direction: "undo" | "redo";
  updatedAt: IsoTimestamp;
}

export interface RecoveryRequest {
  gameId: GameId;
  expectedInvalidHeadRevisionId: RevisionId;
  validAncestorRevisionId: RevisionId;
  updatedAt: IsoTimestamp;
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  exportVersion: typeof EXPORT_VERSION;
  exportedAt: IsoTimestamp;
  applicationVersion: string;
  game: StoredGame;
  activeBranch: StoredRevision[];
  optionalBranches?: StoredRevision[][];
  integrity: {
    algorithm: "SHA-256";
    documentHash: string;
  };
}

export interface ImportPreview {
  title: string;
  playerNames: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  revisionCount: number;
  completedTurns: number;
  sourceApplicationVersion: string;
  sourceDocumentVersion: number;
}

export interface ValidatedImport {
  document: ExportDocument;
  revisions: StoredRevision[];
  preview: ImportPreview;
}

export interface GameRepository {
  initialize(): Promise<void>;
  listGames(): Promise<StoredGame[]>;
  loadGame(id: GameId): Promise<LoadedGame | null>;
  resumeGame(id: GameId, at: IsoTimestamp): Promise<LoadedGame>;
  getRevisionHistory(id: GameId): Promise<StoredRevision[]>;
  createGame(game: StoredGame, revision: StoredRevision): Promise<void>;
  commitRevision(input: RevisionCommit): Promise<StoredRevision>;
  moveHead(input: HeadMove): Promise<LoadedGame>;
  recoverGame(input: RecoveryRequest): Promise<LoadedGame>;
  archiveGame(id: GameId, at: IsoTimestamp): Promise<void>;
  deleteGame(id: GameId): Promise<void>;
  exportGame(id: GameId, exportedAt: IsoTimestamp): Promise<ExportDocument>;
  previewImport(input: unknown): Promise<ValidatedImport>;
  importGame(input: ValidatedImport, ids: ImportIdSource): Promise<GameId>;
}

export interface ImportIdSource {
  gameId(): GameId;
  revisionId(): RevisionId;
  commandId(): CommandId;
  now(): IsoTimestamp;
}
