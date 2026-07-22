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
| Package manager     | pnpm via Corepack                     | Reproducible installs and strict dependency layout                                |
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

```text
/
  docs/
  public/
  src/
    app/                  composition root, boot, providers
    domain/
      game/               lifecycle, turns, commands, revisions
      rolls/              balanced decks and secure shuffle ports
      cities-knights/     progress and barbarian rules
      thematic-events/    trigger and selection decks
    application/          use cases and transaction orchestration
    infrastructure/
      persistence/        IndexedDB repository and migrations
      randomness/         Web Crypto adapter
      platform/           wake lock, fullscreen, broadcast channel
      pwa/                service-worker update integration
    ui/
      components/         reusable accessible primitives
      features/           setup, game table, attack, history, settings
      styles/             tokens and global reset
    assets/               original icons and optional audio
    test/                 shared test builders and fakes
  e2e/
  scripts/
```

Tests live beside source when they describe one unit; cross-feature and browser
tests live in `src/test` and `e2e`.

## 4. Dependency rules

```text
ui -> application -> domain
infrastructure -> application ports and domain data
app -> all layers for composition only
domain -> no React, DOM, storage, clock, or browser imports
```

The domain layer may depend only on TypeScript and small pure utility modules.
Infrastructure implements interfaces defined inward. UI never writes
IndexedDB directly and never mutates domain state.

An import-boundary lint rule enforces these directions.

## 5. Domain engine

### 5.1 Commands

Representative commands:

```ts
type GameCommand =
  | { type: "game.start"; setup: GameSetup }
  | { type: "roll.draw" }
  | { type: "roll.alchemy"; red: DieValue; yellow: DieValue }
  | { type: "resolution.progressAcknowledged"; rollId: RollId }
  | {
      type: "attack.confirmed";
      proposalId: ProposalId;
      correction?: AttackCorrection;
    }
  | { type: "event.acknowledged"; eventId: EventId }
  | {
      type: "player.publicStateAdjusted";
      playerId: PlayerId;
      patch: PublicStatePatch;
    }
  | {
      type: "metropolis.corrected";
      discipline: Discipline;
      holderId: PlayerId | null;
    }
  | { type: "turn.ended" }
  | { type: "history.undo" }
  | { type: "history.redo" }
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
  effects: PresentationEffect[];
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
load current head
  -> acquire game lock
  -> validate expected revision
  -> prepare random/time/id dependencies
  -> decide next state
  -> validate next state invariants
  -> persist revision and head atomically
  -> publish new snapshot
  -> release lock
  -> start presentation effects
```

If persistence fails, the service does not publish the new durable state. It
returns a typed failure with the unsaved candidate available for emergency
export.

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

## 8. Presentation effects

Animation, audio, vibration, focus movement, and announcements are returned as
non-authoritative presentation effects after persistence succeeds.

Effects:

- may fail independently;
- may be skipped under reduced motion or unsupported APIs;
- never trigger a second domain command implicitly;
- never contain the only copy of a required result.

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

1. checkout and pinned Node/pnpm setup;
2. frozen dependency install;
3. format, lint, type, unit/property/component, coverage, and production build
   gates;
4. desktop/mobile Chromium, desktop Firefox, and mobile WebKit Playwright
   flows against the built preview;
5. a repository-base-path production build;
6. Pages configuration and immutable artifact upload;
7. deployment through the `github-pages` environment;
8. a public-HTML smoke check against the deployed URL.

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
- serializability of persisted types;
- deterministic replay from stored revisions;
- bundle budget;
- no external network requests in offline end-to-end tests.
