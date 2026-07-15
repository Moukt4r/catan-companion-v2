# Testing and Delivery Specification

## 1. Quality policy

The application is a rules and bookkeeping tool. A visually correct screen
with an incorrect or non-durable result is a release blocker.

Testing prioritizes:

1. domain invariants;
2. persistence atomicity;
3. rule-flow correctness;
4. accessibility;
5. offline and update behavior;
6. visual polish.

## 2. Test layers

### 2.1 Domain unit tests

Use table-driven tests for:

- valid and invalid phase transitions;
- turn and round advancement;
- progress eligibility at every improvement level and red-die value;
- barbarian strength and defense calculations;
- successful defense with unique winner;
- successful defense with every tie arrangement;
- barbarian victory with protected-metropolis fall-through;
- temporary and permanent metropolis assignment and transfer;
- first-attack robber activation;
- public-state invariant enforcement;
- winner confirmation;
- thematic event cooldown and ordering;
- Alchemy behavior.

Domain tests use no DOM, fake timers only where necessary, and deterministic
dependencies.

### 2.2 Property-based tests

Use fast-check for properties that examples cannot cover adequately.

#### Numbered deck

For many generated random sources:

- cycle length is 36;
- every pair is within 1 through 6;
- all 36 ordered pairs are unique;
- every ordered pair appears exactly once;
- cursor never skips or repeats within a cycle;
- serialization and restore preserve the next result;
- undo restores the exact next result;
- no generated index is outside the Fisher-Yates bound.

#### Event deck

- cycle length is 6;
- count is exactly 3 barbarian, 1 science, 1 trade, 1 politics;
- restore and undo preserve the next event;
- cycles remain independent.

#### Game state

- every accepted command produces a state satisfying invariants;
- rejected commands leave the input state unchanged;
- replaying the same dependencies and command sequence produces identical
  hashes;
- save/load round trips preserve state;
- undo then redo returns the same state hash;
- branching after undo does not mutate the abandoned branch.

### 2.3 Persistence integration tests

Run against fake IndexedDB for speed and selected real-browser IndexedDB tests
for behavior fidelity.

Cover:

- atomic revision/head/summary commit;
- idempotent command retry;
- expected-revision conflict;
- schema migration from every published version;
- copy-on-write game migration;
- hash mismatch recovery;
- import validation and collision handling;
- quota and transaction failures;
- multi-tab expected-revision conflict behavior.

### 2.4 Component tests

Testing Library covers user-observable behavior:

- setup validation and keyboard reorder;
- roll state and disabled duplicate action;
- progress eligibility presentation;
- attack verification and confirmation;
- public-state editing;
- thematic event acknowledgement;
- history, undo, redo, and branch warning;
- save failure and recovery;
- update prompt;
- accessible names, focus return, and live announcements.

Avoid snapshots for logic. Use targeted visual snapshots only for stable SVG
dice and icon assets.

### 2.5 End-to-end tests

Playwright runs the built application, not the development server.

Critical projects:

- Chromium desktop;
- Chromium mobile viewport;
- WebKit mobile viewport;
- Firefox desktop smoke.

Critical flows:

1. create a four-player standard game;
2. complete a normal roll and end turn;
3. reload during result animation;
4. complete progress-card guidance;
5. complete barbarian defense, tie, and defeat paths;
6. use Alchemy and verify deck cursor behavior;
7. trigger and acknowledge a thematic event;
8. undo and redo a roll and an attack;
9. close and resume an active game;
10. export, delete, and import;
11. operate offline after first load;
12. accept a service-worker update between turns;
13. reject a second-tab concurrent roll;
14. freeze all timers while paused and resume without counting the break;
15. attribute elapsed turn time to each player across next-player rolls;
16. finish and archive a game.

### 2.6 Accessibility tests

Automated:

- axe-core on every primary screen and dialog;
- color contrast checks for token palette;
- no missing accessible names;
- focus order assertions for critical flows;
- reduced-motion rendering.

Manual before release:

- keyboard-only;
- VoiceOver on iOS or macOS;
- TalkBack on Android;
- NVDA on Windows;
- 200 percent zoom and 320 CSS-pixel reflow;
- high contrast and forced colors;
- touch targets on a physical phone and tablet.

Automated checks do not replace manual assistive-technology review.

## 3. Coverage gates

- `src/domain`: at least 95 percent branches and 95 percent statements.
- `src/application`: at least 90 percent branches.
- overall tested source: at least 85 percent branches and statements.
- no lowered threshold without a reviewed decision and compensating test plan.

Coverage excludes generated service-worker output, type-only/barrel files,
static asset declarations, and the React composition/bootstrap shell that is
covered through the Playwright critical-flow suite. Domain, application,
persistence, platform, and reusable UI behavior remain in the unit coverage
gate.

Mutation testing may be introduced for deck and attack modules after the first
release, but is not a release prerequisite.

## 4. Static analysis

CI checks:

- Prettier formatting;
- ESLint with type-aware rules;
- strict TypeScript build with no emit;
- dependency-boundary rules;
- no floating promises;
- exhaustive switch handling;
- no explicit `any` without a narrowly documented exception;
- no unsafe HTML injection;
- no browser imports in the domain layer;
- no root-absolute asset paths.

## 5. Performance testing

### Budgets

- initial JavaScript: 250 KB gzip maximum;
- initial CSS: 50 KB gzip maximum;
- no single optional audio asset above 150 KB without review;
- LCP under 2.5 seconds at p75 on the selected mobile profile;
- interaction response under 100 ms excluding deliberate animation;
- IndexedDB command commit under 100 ms at p75 for a 200-revision game.

### Tests

- production bundle analysis in CI;
- Lighthouse CI on home, setup, and active game;
- 200-revision and 1,000-revision synthetic game benchmarks;
- animation frame profiling on representative mobile hardware;
- offline cold and warm start.

## 6. Security testing

- Validate malicious and oversized import fixtures.
- Test script-like player names render only as text.
- Verify Content Security Policy against the production build.
- Confirm no runtime third-party requests.
- Run dependency review on pull requests.
- Run package audit as advisory unless a reachable high-severity issue exists;
  reachable high or critical vulnerabilities block release.
- Review service-worker cache poisoning and stale-asset scenarios.

## 7. Browser support

Support current and previous major releases of:

- Chrome/Edge;
- Safari, including installable iOS PWA behavior;
- Firefox for browser use.

Progressive features such as wake lock, Web Locks, share, and fullscreen use
capability checks and tested fallbacks.

The exact minimum version matrix is set at implementation start from current
usage and feature support, then committed to the README.

## 8. Continuous integration

### Pull requests

One workflow runs:

1. dependency install with frozen lockfile;
2. format check;
3. lint;
4. type check;
5. unit/property/component tests with enforced coverage thresholds;
6. production build;
7. desktop and mobile Chromium Playwright critical smoke.

Cancel superseded runs on the same branch.

### Main branch

CI and Pages deployment run as separate workflows on each push to `main`. The
deployment workflow repeats the quality gates independently, then runs
desktop/mobile Chromium flows, the repository-path build, Pages artifact
upload, deployment, and a public HTML smoke check. Pages deploys only after its
build job succeeds.

WebKit, Firefox, Lighthouse, and broader device checks remain manual release
checks until dedicated automated projects are added.

### Planned scheduled checks

The following checks are desirable but are not currently scheduled:

- full dependency audit;
- latest supported browser matrix;
- migration/import corpus;
- offline PWA install/update flow.

## 9. Deployment

GitHub Pages deployment:

- uses an immutable build artifact from the tested commit;
- targets the `github-pages` environment, where repository administrators may
  add deployment protection rules;
- reports the deployed commit and URL;
- keeps source maps out of public artifacts unless explicitly approved;
- embeds application and schema versions;
- verifies that the site is reachable at the repository base path;
- runs a post-deploy smoke test without mutating real game data.

Concrete release, verification, service-worker, and rollback commands are in
[publishing.md](publishing.md). Game migrations must remain
backward-recoverable through the backup strategy; a code rollback must not
silently open newer data with older logic.

## 10. Release checklist

Before the first production tag:

- product acceptance scenarios pass;
- all official-rule summaries are checked against current sources;
- original event text and assets receive legal/licensing review;
- no reference-prototype code or assets are present;
- install and offline flows pass on physical iOS and Android devices;
- update prompt preserves an active game;
- import/export round trip passes across two browsers;
- no unresolved high-severity accessibility defects;
- no known data-loss, duplicate-roll, or incorrect-attack defects;
- README deployment and local-development instructions are current;
- changelog describes migrations and visible house-rule changes.

## 11. Definition of done

A work item is done when:

- behavior matches the specification;
- domain and UI errors are explicit;
- tests cover success, boundary, and failure paths;
- persistence and migration impact is addressed;
- accessibility is verified;
- relevant documentation is updated;
- no unrelated code or dependency is introduced;
- the smallest relevant local and CI checks pass.
