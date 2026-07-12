# Data and Reliability Specification

## 1. Reliability objective

Once the app confirms an action, that action must survive refresh, browser
restart, device sleep, orientation change, service-worker update, and temporary
loss of connectivity.

The app favors explicit failure over success-shaped fallback. It must never
invent a roll, silently reset a deck, or replace an unreadable game with a new
one.

## 2. Storage choice

Use IndexedDB for all games and revision history. Use local storage only for
non-critical device preferences that can safely reset, such as the last
selected theme.

IndexedDB is required because it offers:

- transactions across revision, head, and summary records;
- structured versioned data;
- enough space for full revision snapshots;
- safe asynchronous access;
- compatibility with offline static hosting.

The implementation may use Dexie or a similarly small adapter, but all library
types remain inside `src/infrastructure/persistence`.

## 3. Database layout

Database name: `catan-table-companion`

Logical stores:

| Store | Key | Purpose |
| --- | --- | --- |
| `metadata` | string | Database schema, install ID, migration status |
| `games` | game ID | Summary, lifecycle status, active branch, head revision |
| `revisions` | game ID + revision ID | Immutable command metadata and full state snapshot |
| `navigation` | game ID + sequence | Undo, redo, branch, archive, and restore audit |
| `quarantine` | generated ID | Invalid imports or failed migration source records |

One installation may retain one active game and multiple archived games.

## 4. Versioning

Three versions are distinct:

- **Application version:** deployed release identifier.
- **Database schema version:** IndexedDB store/index structure.
- **Game document version:** serialized game-state shape and rules-data version.

Every revision includes all three relevant identifiers so support can explain
how a result was produced.

## 5. Core persisted types

The exact implementation may refine names, but it must preserve these concepts:

```ts
interface StoredGame {
  id: GameId;
  status: 'active' | 'completed' | 'archived' | 'corrupt';
  title: string;
  playerSummaries: PlayerSummary[];
  activeBranchId: BranchId;
  headRevisionId: RevisionId;
  latestRevisionId: RevisionId;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  completedAt?: IsoTimestamp;
  gameDocumentVersion: number;
  rulesDataVersion: string;
}

interface GameRevision {
  id: RevisionId;
  gameId: GameId;
  branchId: BranchId;
  parentRevisionId: RevisionId | null;
  sequence: number;
  command: PersistedCommand;
  summary: JournalSummary;
  state: GameState;
  stateHash: string;
  createdAt: IsoTimestamp;
  applicationVersion: string;
  gameDocumentVersion: number;
  rulesDataVersion: string;
}
```

Persisted commands exclude functions, random providers, errors, and
presentation effects.

## 6. Game state shape

```ts
interface GameState {
  id: GameId;
  status: GameStatus;
  setup: GameSetup;
  turn: TurnState;
  players: PlayerState[];
  metropolises: MetropolisState;
  numberedDeck: NumberedDeckState;
  eventDeck: EventDeckState;
  thematicEvents: ThematicEventState;
  barbarian: BarbarianState;
  resolution: ResolutionState;
  scoreLedger: ScoreEntry[];
  lastRoll: RollRecord | null;
  statistics: GameStatistics;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
```

### Player state

```ts
interface PlayerState {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  order: number;
  ordinaryCities: number;
  activeKnights: {
    basic: number;
    strong: number;
    mighty: number;
  };
  improvements: {
    science: ImprovementLevel;
    trade: ImprovementLevel;
    politics: ImprovementLevel;
  };
}
```

### Score ledger

```ts
interface ScoreEntry {
  id: ScoreEntryId;
  playerId: PlayerId;
  delta: number;
  reason:
    | 'initial'
    | 'manual'
    | 'defender'
    | 'metropolis'
    | 'merchant'
    | 'longest-road'
    | 'revealed-progress-vp'
    | 'correction';
  note?: string;
  createdAt: IsoTimestamp;
}
```

Public victory points are derived by summing one player's ledger entries.
There is no separately persisted score total that can drift from its audit
history. Standard setup writes an initial +3 entry for each player.

### Metropolis state

```ts
type MetropolisDiscipline = 'science' | 'trade' | 'politics';

type MetropolisControl =
  | { holderId: PlayerId; status: 'temporary' | 'permanent' }
  | null;

type MetropolisState = Record<MetropolisDiscipline, MetropolisControl>;
```

Per-player metropolis counts are derived from this record. Assignment or
transfer is committed with its ordinary-city and score-ledger changes in one
revision.

### Deck state

```ts
interface DeckState<T> {
  cycle: number;
  cursor: number;
  order: T[];
  createdAtRevision: RevisionId;
}
```

The order is stored because regeneration from a seed would create unnecessary
coupling to one pseudo-random algorithm and complicate migrations.

## 7. Revision model

Every accepted state-changing command creates an immutable full snapshot.
Expected game size is small enough that correctness is more valuable than
delta compression.

### Commit transaction

Within one IndexedDB transaction:

1. read and verify the expected game head;
2. add the immutable revision;
3. update active branch and head;
4. update the game summary;
5. commit.

If any step fails, none of the records change.

### Undo and redo

- Revisions form a parent-linked graph.
- Undo moves the active head to its parent and writes a navigation audit entry.
- Redo moves to the last undone child when no new command has branched.
- A new command after undo creates a new branch; prior revisions remain
  recoverable and exportable.
- The active branch is what normal history and resume views display.

Moving the head to an existing immutable snapshot guarantees that deck
positions and all side effects are restored together.

### Checksums

Each revision stores a SHA-256 hash of a canonical serialized state. Load and
export verify the hash. A mismatch marks the game corrupt and initiates
recovery rather than loading partial data.

## 8. Save behavior

- The primary action is disabled while its previous command is committing.
- Normal saves should complete within 100 ms on representative devices.
- The UI displays Saving until the transaction commits.
- Animation begins only after commit.
- Non-state preferences may save independently and may not block play.

If saving fails:

1. retain the candidate state in memory;
2. block additional mutations;
3. expose Retry;
4. expose emergency JSON export of the last durable revision plus candidate;
5. expose Revert candidate;
6. record a sanitized local diagnostic.

## 9. Boot and recovery

Boot sequence:

1. register capability information;
2. open the database;
3. complete or roll back interrupted structural migration;
4. load metadata and active-game summary;
5. load and validate the head revision;
6. verify state hash and invariants;
7. acquire read or mutation coordination;
8. render the appropriate screen;
9. register the service worker after the first usable render.

Recovery order for an invalid head:

1. previous revision on the same branch;
2. most recent verified revision on another branch;
3. latest pre-migration backup;
4. quarantine and manual import/export options.

The app never silently selects an older revision. It explains the proposed
recovery and requires confirmation.

## 10. Migrations

### Structural database migrations

- Run through IndexedDB version upgrades.
- Keep upgrade functions small and idempotent where possible.
- Never perform expensive full-document transformation inside the versionchange
  transaction.

### Game document migrations

Use copy-on-write:

1. validate the old document against its version schema;
2. create a backup record;
3. migrate in memory through every intermediate version;
4. validate domain invariants and compute a new hash;
5. write a new migration revision;
6. switch the game head only after successful commit.

Failed source data is copied to quarantine and remains exportable.

No release may remove a migration needed by any previously published
production schema unless an explicit support-window decision is recorded.

## 11. Import format

Export MIME type:

```text
application/vnd.catan-table-companion.game+json
```

Top-level shape:

```ts
interface ExportDocument {
  format: 'catan-table-companion';
  exportVersion: number;
  exportedAt: IsoTimestamp;
  applicationVersion: string;
  game: StoredGame;
  activeBranch: GameRevision[];
  optionalBranches?: GameRevision[][];
  integrity: {
    algorithm: 'SHA-256';
    documentHash: string;
  };
}
```

### Import validation

- Maximum file size: 10 MB.
- Parse as JSON only.
- Validate top-level discriminator and supported version.
- Validate every primitive range and identifier relationship.
- Verify revision chain, parent links, sequence, and hashes.
- Re-run current domain invariants.
- Show a preview with player names, date, turns, and source version.
- Import under a new local game ID by default to avoid collision.
- Replace an existing game only through explicit confirmed action.

Unknown fields are rejected at trust boundaries unless a versioned migration
explicitly accepts them.

## 12. Export and backup UX

- Manual export is always available from the game menu.
- Suggest export before delete, destructive import, or unsupported migration.
- Completed games can export a compact summary or full audit record.
- Use a filesystem-friendly name such as
  `catan-companion-2026-07-12-game-name.json`.
- On platforms with the Web Share API, offer Share in addition to Download.
- Do not upload backups automatically.

## 13. Storage quota

- Estimate storage at boot and before large imports.
- Warn below a safe remaining threshold.
- Do not request persistent storage until a game starts and explain why.
- If `navigator.storage.persist()` is supported, request it from a user gesture.
- Archive retention is user-controlled.
- Provide per-game and total storage usage where the browser exposes estimates.

Full snapshots are acceptable because a typical game remains small. If
measured production games approach 5 MB each, add reviewed snapshot compaction
without changing the logical revision model.

## 14. Concurrency and revision conflicts

Every command includes:

- game ID;
- expected head revision ID;
- controlling tab ID;
- command ID.

The repository rejects a commit if the head changed. The application reloads
the new head and explains that another tab took control. It never automatically
reapplies a stale roll or public-state edit.

Command IDs make retries idempotent: if a transaction committed but its success
response was lost, retry returns the already-created revision rather than
creating another roll.

## 15. Privacy

Stored data contains player-entered names and game history only on the local
device. There is no account identity or analytics identifier.

- No runtime network calls are required.
- Diagnostics omit game content by default.
- Export is user initiated.
- Delete removes the game and all branches in one transaction after
  confirmation.
- Documentation must explain that clearing browser data removes local games
  unless exported.

## 16. Failure-injection requirements

Automated tests must simulate:

- quota exceeded;
- transaction abort;
- browser close after revision insert but before head update;
- duplicate command retry;
- stale expected revision;
- corrupt head hash;
- interrupted migration;
- unsupported import version;
- service-worker update during an active game;
- two tabs attempting to roll concurrently.

For every case, the expected result is either one complete durable action or no
state change.
