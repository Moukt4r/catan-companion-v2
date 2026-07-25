# Architecture Specification

## 1. Architectural drivers

The architecture is optimized for:

1. correct and testable game rules;
2. durable local state;
3. offline operation;
4. static GitHub Pages deployment;
5. low interaction latency;
6. safe upgrades and migrations;
7. accessibility;
8. minimal dependency and maintenance burden.

There is no backend in the first release.

## 2. Technology baseline

| Area                | Choice                                | Rationale                                                                         |
| ------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Language            | TypeScript in strict mode             | Shared types and exhaustive domain handling                                       |
| UI                  | React                                 | Mature accessible component ecosystem and predictable rendering                   |
| Build               | Vite                                  | Fast local development and static optimized output                                |
| Package manager     | pnpm 11.12.0                          | Reproducible installs via Corepack locally and the pinned pnpm setup action in CI |
| Domain state        | Pure reducers and commands            | Framework-independent correctness and replay                                      |
| Persistence         | IndexedDB adapter                     | Transactional, durable, versioned browser storage                                 |
| Boundary validation | Zod                                   | Runtime validation for imports, persistence, and migrations                       |
| Styling             | Layered global CSS plus design tokens | Small static bundle, predictable responsive states, and no runtime CSS dependency |
| PWA                 | vite-plugin-pwa / Workbox             | Manifest, precache, and controlled updates                                        |
| Unit tests          | Vitest                                | Native Vite/TypeScript workflow                                                   |
| UI tests            | Testing Library                       | Behavior-focused component tests                                                  |
| Property tests      | fast-check                            | Strong coverage of decks and rule invariants                                      |
| End-to-end          | Playwright                            | Browser, offline, install, persistence, and accessibility flows                   |

Exact versions are pinned to current stable releases when implementation
starts. Runtime and package-manager versions are committed through
`packageManager`, `.nvmrc` or an equivalent tool, and the lockfile.

## 3. Repository structure

Current repository layout:

```text
/
  .github/
    workflows/            CI and Pages deployment
  docs/
  public/
  src/
    app/                  React shell, game/board controller wiring, hooks, PWA update prompt
    application/          game and board use cases, ports, persistence contracts, integrity helpers
    domain/               pure game rules, decks, clocks, selectors, invariants, shared types
      boardDesigner/      axial geometry, inventory, generation, validation
    infrastructure/
      persistence/        IndexedDB repository, import/export schemas, durable record handling
      platform/           browser adapters for files, diagnostics, storage, wake lock, audio, single-tab control
      randomness/         Web Crypto adapter
    ui/
      components/         reusable accessible primitives
      features/
        home/             active/saved/completed game flows and import dialogs
        setup/            setup wizard and preferences handoff
        game/             table, roll resolution, history, recovery, pause, and winner flows
        board-designer/   local board library, inventory, SVG editor, validation, export
        settings/         device preferences and storage controls
      styles/             tokens, reset, and tabletop layout styles
    assets/               locally served illustrations and static assets
    test/                 Vitest setup and shared test helpers
  e2e/
  scripts/                deterministic CI helpers such as bundle-budget checks
```

Most unit and component tests are colocated with the source they exercise.
`src/test` holds shared Vitest setup, and `e2e` holds Playwright critical-flow
coverage.

## 4. Dependency rules

```text
domain -> no app, application, infrastructure, ui, React, or browser imports
application -> domain only
infrastructure -> application ports/contracts and domain types
ui -> application-facing types and domain-derived view data; no app or infrastructure imports
app -> composition root that wires application, infrastructure, and UI together
```

The domain layer may depend only on TypeScript and small pure utility modules.
Infrastructure implements interfaces defined inward. UI never writes
IndexedDB directly and never mutates domain state. The React app shell owns the
browser-only side effects that sit above those layers, such as wake lock,
diagnostics copy, file import/export, and update prompts.

ESLint `no-restricted-imports` rules enforce these directions.

## 5. Domain engine

### 5.1 Commands

Representative commands:

```ts
type GameCommand =
  | { type: "clock.started" }
  | { type: "clock.paused" }
  | { type: "clock.resumed" }
  | { type: "roll.draw" }
  | { type: "roll.alchemy"; red: DieValue; yellow: DieValue }
  | { type: "resolution.progressAcknowledged"; rollId: RollId }
  | { type: "resolution.productionAcknowledged"; rollId: RollId }
  | {
      type: "player.publicStateAdjusted";
      playerId: PlayerId;
      patch: PublicStatePatch;
    }
  | {
      type: "metropolis.assignmentProposed";
      discipline: MetropolisDiscipline;
      holderId: PlayerId | null;
      status: "temporary" | "permanent" | null;
    }
  | { type: "metropolis.proposalConfirmed"; proposalId: ProposalId }
  | { type: "metropolis.proposalCancelled"; proposalId: ProposalId }
  | {
      type: "attack.confirmed";
      proposalId: ProposalId;
      progressChoices?: Array<{
        playerId: PlayerId;
        discipline: ProgressDiscipline;
      }>;
    }
  | { type: "event.acknowledged"; occurrenceId: EventOccurrenceId }
  | { type: "turn.ended" }
  | { type: "game.completed"; winnerId: PlayerId };
```

Commands contain intent, not derived state.

### 5.2 Decision and evolution

The domain API is pure:

```ts
type Decide = (
  state: GameState,
  command: GameCommand,
  deps: DomainDeps,
) => Decision;

interface Decision {
  nextState: GameState;
  summary: JournalSummary;
  presentation: PresentationSummary;
}
```

`DomainDeps` contains deterministic values supplied by the application layer:

- random bytes or a pre-shuffled deck;
- current timestamp;
- generated IDs;
- rules data version.

The reducer never calls `Date.now`, `crypto`, or storage itself.

### 5.3 Exhaustiveness

- Commands and phases are discriminated unions.
- All switches use exhaustive `never` checks.
- Invalid commands return typed domain errors.
- Persisted data uses plain arrays, records, strings, numbers, and booleans.
- No class instances, functions, Maps, Sets, DOM objects, or library objects are
  persisted.

## 6. Application layer

The application service is the single mutation entry point:

```text
load or resume the active game
  -> acquire single-tab control when writable access is needed
  -> prepare random/time/id dependencies
  -> decide the next state in the pure domain engine
  -> validate next state invariants
  -> persist the revision and move the head atomically
  -> refresh the controller snapshot and revision history
  -> publish read-only or writable state to the app shell
```

If persistence fails, the controller does not publish the new durable state. It
retains the failed commit only when recovery is possible, exposes that pending
save in the snapshot, and requires the user to resolve it before making another
change.

Reads use selectors over the current immutable snapshot. React subscribes
through a small external-store adapter so domain state is not coupled to a
large state-management framework.

## 7. Randomness architecture

The domain defines:

```ts
interface RandomSource {
  nextUint32(): number;
}
```

Production uses `crypto.getRandomValues`. Tests use deterministic fakes.
Shuffle utilities implement unbiased bounded integer selection with rejection
sampling.

Deck creation occurs in the application transaction before the first draw from
that deck. The persisted shuffled deck is authoritative. Randomness is never
re-requested during replay, resume, or undo.

## 8. Presentation summaries

The domain returns a compact `presentation` summary alongside each durable
state transition. It describes what the UI should emphasize next: a created
game, a roll result, a pending resolution, a metropolis proposal, a barbarian
attack, a thematic event, a turn handoff, or a completed game.

That summary is non-authoritative UI guidance:

- the durable state remains the source of truth;
- audio, motion, focus movement, and announcements may be derived from it by
  the app shell;
- browser-side affordances may be skipped under reduced motion or unsupported
  APIs;
- the summary never replaces persisted results or triggers a second domain
  command implicitly.

The result text is rendered from durable state.

## 9. UI component strategy

Build accessible primitives around native elements:

- Button
- IconButton
- Dialog
- Sheet
- NumberStepper
- SegmentedControl
- StatusBanner
- PlayerMarker
- DieFace
- LiveAnnouncement

Use a headless accessibility library only for behavior that is difficult to
implement safely, such as robust dialogs. Do not adopt a full visual component
framework unless an architecture decision demonstrates a clear benefit.

Feature components receive view models and invoke application commands. They
do not calculate official rule outcomes.

## 10. Persistence boundary

The `GameRepository` port provides:

```ts
interface GameRepository {
  listGames(): Promise<GameSummary[]>;
  loadGame(id: GameId): Promise<StoredGame | null>;
  commitRevision(input: RevisionCommit): Promise<void>;
  archiveGame(id: GameId): Promise<void>;
  deleteGame(id: GameId): Promise<void>;
  importGame(document: ExportDocument): Promise<GameId>;
  exportGame(id: GameId): Promise<ExportDocument>;
}
```

IndexedDB implementation details are specified in
[data and reliability](data-and-reliability.md).

The board designer uses a separate `BoardDesignRepository` port with CRUD
operations over complete versioned design documents. Its controller mirrors
the external-store subscription shape of `GameController`, but it does not use
the game revision graph, active-game lock, or game import format. Board
generation and validation remain pure domain functions, while SVG rendering
and browser export stay in the UI/platform layers.

The designer creates or accepts a persisted 180-degree rotationally symmetric
axial-coordinate footprint and assigns all terrain types, including sea and
Gold Field, within it. Width × height rebuilding starts from the requested
centered axial bounds and removes symmetric boundary pairs until the fixed tile
count is reached. Candidate removal preserves exact bounds and connectivity,
prefers hex-convex results, then minimizes weak cells, perimeter, and distance
from the rotation center. Incompatible capacity or odd/even parity is rejected
before mutation. Explicit mirrored pair add/remove remains available for small
manual edits. This keeps the physical layout connected without requiring land
itself to be connected, allowing archipelagos and sea clusters. Candidate
layouts with land components smaller than three hexes are rejected by
generation scoring and final invariant checks.

Each board document carries a monotonically increasing revision number.
Updates and deletes compare the caller's expected revision inside one
IndexedDB transaction. A stale editor therefore reloads the latest durable
document instead of overwriting another tab's accepted edits.

## 11. Multi-tab coordination

Only one tab may mutate an active game:

1. Prefer the Web Locks API for an exclusive per-game lock.
2. Where Web Locks is unavailable, use an expiring per-game local-storage
   lease with page-hide release and heartbeat renewal.
3. Use `BroadcastChannel` for presence and revision notifications.
4. Keep the atomic expected-head revision check as the final split-brain
   safeguard when browser coordination APIs or storage are unavailable.
5. Secondary tabs are read-only and identify the active controlling tab when
   presence APIs are available.
6. Takeover requires a released Web Lock, a released fallback lease, or an
   expired lease from an unresponsive tab.

The application revalidates ownership before each mutation and after external
revision notifications, so a tab that loses its fallback lease becomes
read-only before it can write again.

Every commit includes an expected head revision, so split-brain writes fail
rather than overwrite.

## 12. PWA and offline behavior

### App shell

Precache:

- HTML entry point;
- versioned JavaScript and CSS;
- manifest and icons;
- original local audio, if enabled;
- built-in thematic event data.

The active game never depends on a network response.

### Service-worker updates

Use a prompt-based update policy:

- download the new worker in the background;
- show Update ready;
- defer activation during unresolved roll, attack, import, or save failure;
- persist and verify current state before accepting;
- reload only after user confirmation;
- run schema migrations during boot with rollback protection.

Forced automatic reloads are prohibited.

### GitHub Pages routing

The first release uses one document URL and state-driven screens. It does not
require history API routes or a `404.html` redirect trick.

Vite and the web manifest derive their base path from the repository name at
build time. All asset, icon, worker, and start URLs use Vite's base URL rather
than root-absolute paths.

## 13. GitHub Pages deployment

GitHub Actions performs:

1. checkout plus `actions/setup-node` and Corepack activation of pnpm 11.12.0;
2. frozen dependency install;
3. format, lint, type, production dependency audit, coverage, and production
   build gates;
4. deterministic gzip bundle-budget verification against the built entry CSS
   and JavaScript;
5. desktop/mobile Chromium, desktop Firefox, and mobile WebKit Playwright
   flows against the built preview;
6. a repository-base-path production build;
7. Pages configuration and immutable artifact upload;
8. deployment through the `github-pages` environment;
9. a public-HTML smoke check against the deployed URL.

Use official current major versions of:

- `actions/checkout`;
- `actions/setup-node`;
- `actions/configure-pages`;
- `actions/upload-pages-artifact`;
- `actions/deploy-pages`.

The workflow receives only `contents: read`, `pages: write`, and
`id-token: write` where deployment requires them. Pull requests never receive
deployment credentials.

Operational release and rollback steps are maintained in
[the publishing runbook](publishing.md).

## 14. Performance architecture

- Split setup/history/settings from the initial game shell where useful.
- Do not ship Three.js or a physics engine in v1.
- Prefer SVG and CSS transforms for dice.
- Lazy-load optional audio.
- Avoid global rerenders by subscribing to narrow view models.
- Keep long game history virtualized only after profiling demonstrates need.
- Enforce a 250 KB gzip initial JavaScript budget.
- Measure production builds in CI.

## 15. Security and privacy

- No accounts, analytics, ads, trackers, or third-party runtime scripts.
- No game data leaves the device unless the user exports it.
- Treat imported JSON as untrusted and validate size, schema, values, and
  referential integrity.
- Escape all user-provided names through React text rendering; never inject
  HTML.
- Built-in event content is static typed data and never interpreted as HTML.
- Use a restrictive Content Security Policy compatible with GitHub Pages.
- Pin dependencies through the lockfile and enable Dependabot or Renovate.
- Review service-worker caching so old HTML does not reference deleted assets.

## 16. Observability

There is no remote telemetry by default. Local diagnostics include:

- application and schema versions;
- browser capability flags;
- storage quota estimate;
- current revision and last successful save;
- sanitized error codes and stack hashes;
- service-worker version.

Player names, event history, and roll history are excluded from copied
diagnostics unless the user explicitly includes game data.

## 17. Architectural fitness checks

CI must enforce:

- no browser imports under `src/domain`;
- no infrastructure imports under `src/domain` or UI feature logic;
- strict TypeScript with no unchecked `any`;
- dependency review on pull requests;
- production dependency audit with a high-severity threshold;
- serializability of persisted types;
- deterministic replay from stored revisions;
- deterministic initial bundle budget;
- no external network requests in offline end-to-end tests.
