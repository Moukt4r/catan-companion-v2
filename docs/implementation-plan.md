# Implementation Plan

## 1. Delivery strategy

Build vertical slices on top of a tested domain and persistence foundation.
Do not begin visual dice polish, audio, or deployment automation before the
roll transaction can be saved, restored, and undone correctly.

Each milestone ends in a usable, testable increment on `main`.

## 2. Milestones

### M0: Specification baseline

Deliver:

- product, rules, UX, architecture, data, test, and delivery specifications;
- architecture decision records;
- clean Git repository and legal baseline.

Exit criteria:

- documents agree on phase flow, deck semantics, attack logic, undo, and
  GitHub Pages constraints;
- no copied prototype code or assets;
- initial specification commit exists.

### M1: Project foundation

Deliver:

- Vite React TypeScript scaffold;
- pnpm and pinned runtime;
- formatting, linting, strict type checking, Vitest, Playwright;
- directory boundaries and import lint rules;
- design tokens and accessible primitive skeletons;
- base-path-aware production build;
- CI build artifact.

Exit criteria:

- empty app builds and runs from a repository subpath;
- domain layer cannot import browser or UI modules;
- CI checks run on a sample pull request.

### M2: Domain engine

Deliver:

- game phases and commands;
- player public-state invariants;
- secure shuffle port and deterministic test adapter;
- balanced numbered and event decks;
- Alchemy semantics;
- turn/round transitions;
- progress eligibility;
- metropolis assignment and transfer proposals;
- barbarian attack proposals;
- thematic trigger and selection decks;
- exhaustive unit and property tests.

Exit criteria:

- all domain requirements run without React or IndexedDB;
- property tests prove deck compositions and replay behavior;
- attack examples and edge cases pass;
- domain coverage meets its release threshold.

### M3: Revision persistence

Deliver:

- IndexedDB schema and repository;
- immutable revision snapshots and head graph;
- atomic command commit;
- undo, redo, and branch behavior;
- hashes and recovery;
- import/export v1;
- multi-tab lock and expected-revision conflict;
- failure-injection integration tests.

Exit criteria:

- every mutation is all-or-nothing;
- reload and duplicate retry cannot create a second roll;
- corrupt head recovery and malformed imports preserve existing data;
- two tabs cannot both mutate one active game.

### M4: Home and setup

Deliver:

- home/resume/new/import/archive flows;
- setup wizard;
- player name, order, and accessible color validation;
- rules and house-rule summary;
- preferences and initial public state;
- responsive shell.

Exit criteria:

- a keyboard-only user can create a standard game;
- setup saves before entering the table;
- active game resumes after reload;
- two-player mode is clearly labeled as a house rule.

### M5: Core turn experience

Deliver:

- table layout;
- current player and round;
- result-first SVG dice;
- normal Roll and Use Alchemy;
- ordered official result sheet;
- production/7 guidance;
- public player editor;
- end-turn flow;
- history and undo UI.

Exit criteria:

- critical normal-turn end-to-end test passes offline;
- reload during animation preserves one result;
- Alchemy does not consume the numbered deck;
- responsive and reduced-motion behavior pass.

### M6: Cities & Knights assistance

Deliver:

- persistent barbarian panel;
- progress eligibility sheet;
- active knight and city/improvement controls;
- attack verification, outcome, correction, and confirmation;
- first-attack robber activation;
- score-ledger integration;
- attack history and undo.

Exit criteria:

- defense win, tie, and barbarian win paths pass end to end;
- protected metropolises and fall-through candidates are correct;
- all active knights reset only after confirmed attack;
- official-rule review is recorded.

### M7: Thematic events

Deliver:

- original built-in event catalog;
- balanced cadence settings;
- event selection deck and cooldown;
- house-event presentation and acknowledgement;
- event content versioning and history;
- content and accessibility review.

Exit criteria:

- event cadence properties pass;
- events never preempt official resolution;
- no immediate repetition when alternatives exist;
- all event text and assets are original.

### M8: PWA and resilience

Deliver:

- manifest and original icons;
- app-shell precache;
- offline install and resume;
- prompt-based service-worker updates;
- persistent-storage and wake-lock enhancements;
- save-failure UX;
- storage diagnostics;
- import/export share integration.

Exit criteria:

- complete game flow works with networking disabled;
- an update waits for a safe phase and preserves state;
- quota and save failures provide recoverable choices;
- physical iOS and Android checks pass.

### M9: Release hardening

Deliver:

- animation and optional original audio;
- performance and bundle optimization;
- full accessibility pass;
- security and CSP review;
- completed game summary;
- documentation and deployment workflow;
- production release tag.

Exit criteria:

- all release success criteria and checklist items pass;
- no known data-loss or rule-critical defects;
- GitHub Pages production deployment is verified.

## 3. Ordered work packages

| ID | Work package | Depends on |
| --- | --- | --- |
| WP-001 | Scaffold React, TypeScript, Vite, pnpm, and strict config | M0 |
| WP-002 | Add lint, format, unit, property, and browser test harnesses | WP-001 |
| WP-003 | Enforce architecture import boundaries | WP-001 |
| WP-004 | Define rules data, branded IDs, errors, and shared domain types | WP-001 |
| WP-005 | Implement unbiased Web Crypto random adapter and test fake | WP-004 |
| WP-006 | Implement generic shuffled deck and property tests | WP-005 |
| WP-007 | Implement numbered and event decks | WP-006 |
| WP-008 | Implement game setup, phases, turns, and player invariants | WP-004 |
| WP-009 | Implement roll and Alchemy commands | WP-007, WP-008 |
| WP-010 | Implement progress eligibility and metropolis control | WP-008 |
| WP-011 | Implement barbarian track and attack proposals | WP-008, WP-010 |
| WP-012 | Implement thematic cadence and selection | WP-006, WP-008 |
| WP-013 | Define versioned persistence and import schemas | WP-004 |
| WP-014 | Implement IndexedDB revision repository | WP-013 |
| WP-015 | Implement application transaction service and idempotency | WP-009, WP-014 |
| WP-016 | Implement undo, redo, branching, hashes, and recovery | WP-014, WP-015 |
| WP-017 | Implement multi-tab coordination | WP-015 |
| WP-018 | Build accessible UI primitives and design tokens | WP-001 |
| WP-019 | Build home and setup flows | WP-015, WP-018 |
| WP-020 | Build game table and player strip | WP-015, WP-018 |
| WP-021 | Build persisted roll/result flow | WP-020 |
| WP-022 | Build public player-state editor and turn controls | WP-020 |
| WP-023 | Build progress and barbarian resolution | WP-010, WP-011, WP-021 |
| WP-024 | Build thematic event flow and original event catalog | WP-012, WP-021 |
| WP-025 | Build history, undo, backup, and recovery UI | WP-016, WP-020 |
| WP-026 | Add PWA manifest, service worker, and update coordination | WP-019 |
| WP-027 | Add offline, quota, wake lock, and install enhancements | WP-026 |
| WP-028 | Add GitHub Actions CI and Pages deployment | WP-002, WP-026 |
| WP-029 | Complete accessibility, performance, security, and device passes | WP-023, WP-024, WP-027 |
| WP-030 | Release v1 and verify production rollback procedure | WP-028, WP-029 |

## 4. Work-package rules

- A work package should produce one coherent pull request where practical.
- Domain behavior lands with tests before UI integration.
- Persistence schema changes include migration and import fixtures.
- UI work includes keyboard and reduced-motion behavior.
- Deployment changes are tested against a repository subpath.
- No package is added without documenting why platform or existing utilities
  are insufficient.

## 5. Deferred backlog

After v1:

- custom user-authored thematic events;
- statistics and balanced-cycle visualization after a cycle is complete;
- board-facing spectator layout;
- Seafarers module;
- 5-6 player extension;
- optional encrypted peer-to-peer device sync;
- localization;
- installable desktop packaging only if the PWA proves insufficient.
