# Catan Table Companion

[![CI](https://github.com/Moukt4r/catan-companion-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/Moukt4r/catan-companion-v2/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/Moukt4r/catan-companion-v2/actions/workflows/deploy.yml/badge.svg)](https://github.com/Moukt4r/catan-companion-v2/actions/workflows/deploy.yml)
[![Live site](https://img.shields.io/badge/live-GitHub%20Pages-2ea44f)](https://moukt4r.github.io/catan-companion-v2/)

A production-ready, local-first web companion for one shared-device game of
base CATAN with Cities & Knights. It installs as a PWA, runs offline, deploys
as static GitHub Pages, and requires no account or backend.

- **Live application:** https://moukt4r.github.io/catan-companion-v2/
- **Source repository:** https://github.com/Moukt4r/catan-companion-v2

No code or assets from the earlier `agentic-catan` prototype were copied into
this implementation.

## Features

- Shuffled 36-outcome numbered-dice cycles with exact ordered-pair coverage.
- Independently shuffled event-die cycles with 3 barbarian, 1 science, 1
  trade, and 1 politics face.
- Alchemy rolls that preserve the numbered-deck cursor.
- Inline roll guidance for ordinary results, with a blocking modal only when a
  barbarian attack needs its physical-board outcome and rewards recorded.
- **Next: PLAYER** directly from the active table flow.
- No standalone end-turn button: the next-player action records the turn
  boundary and stops before the next roll so Roll and Use Alchemy are always
  available.
- Live current-turn, per-player accumulated, and total active game timers.
- A persisted Pause mode that stops every timer and blocks all controls except
  Resume.
- Progress-card eligibility guidance using the current 2025 improvement board.
- Barbarian movement, manually recorded physical-board outcomes, Defender/tie
  rewards, pillaging, knight reset, and first-attack robber activation.
- Public player scores, cities, metropolises, active knights, and city
  improvements.
- **World Events v0.2.0:** A typed 20-event engine with five selectable packs
  (Weather & Harvest, Trade & Markets, Conflict & Defense, Diplomacy & Intrigue,
  Festivals & Progress), Off/Subtle/Standard/Lively cadence, tone/impact balance,
  five lifecycle durations, persistent active-event UI with manual resolution,
  and legacy v1 save compatibility.
- **Seasons Mode v0.3.0:** An optional four-season house-rule layer with
  2/3/4-round seasons, selectable starting season, round-boundary transitions,
  and weighted-without-replacement World Event draws. Existing tone/impact and
  compatibility guardrails remain authoritative.
- **FLUX.2 visual system v0.4.0:** Thirteen original local illustrations cover
  the official event-die outcomes, four seasons, and five World Event packs.
  They enrich setup, roll resolution, season transitions, and active events
  without replacing textual guidance or accessible labels.
- **Unique World Event art v0.5.0:** Every built-in World Event has its own
  FLUX.2 illustration. Event images load and cache only when encountered; the
  five lightweight pack images remain offline-safe fallbacks.
- **Procedural soundscape v0.6.0:** Opt-in, offline Web Audio effects distinguish
  dice rolls, Science/Trade/Politics, barbarian advances and attack outcomes,
  every World Event through category/tone/impact plus a unique identity note,
  and season transitions. Volume persists per device, with table-level mute and
  a Settings preview.
- Immutable IndexedDB revisions with undo, redo, branch retention, integrity
  hashes, and verified-ancestor recovery.
- Versioned JSON export/import that never overwrites an existing game.
- Explicit single-tab control with read-only mirrored tabs and takeover.
- Responsive mobile/tablet/desktop layouts, keyboard support, high contrast,
  reduced motion, opt-in procedural sound effects, and sanitized diagnostics.
- Original locally generated frontier illustrations, including a reproducible
  FLUX.2 Dev asset set, with no official CATAN artwork or trade dress.
- Prompted PWA updates and complete offline operation after first load.

Balanced decks, World Events, Seasons Mode, two-player mode, and custom victory
targets are intentionally labeled house rules throughout the application.

## Development

Requirements:

- Node `24.18.0` (`.nvmrc`)
- pnpm `11.12.0`

```powershell
nvm use
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

### Regenerating the FLUX.2 visual set

Normal builds use the committed WebP assets and do not require a model. To
intentionally regenerate them, start the isolated local FLUX.2 ComfyUI service
on `http://127.0.0.1:8190`, then run:

```bash
python3 scripts/generate-flux2-visuals.py
```

Use `--keys event-science season-winter` for selected scenes or `--force` to
replace existing renders. Exact prompts, seeds, model settings, and output paths
are recorded in `docs/flux2-visuals-manifest.json`.

## Quality commands

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

`pnpm check` runs formatting, linting, type checking, unit tests, and the
production build. Playwright separately exercises Chromium, Firefox, and
mobile WebKit critical flows, axe accessibility checks, and offline
service-worker loading.

## GitHub Pages

The repository is already configured and published:

- Source branch: `main`
- Pages source: **GitHub Actions**
- Live URL: https://moukt4r.github.io/catan-companion-v2/
- Deployment workflow: `.github/workflows/deploy.yml`

The deployment workflow builds with:

```text
VITE_BASE_PATH=/<repository-name>/
```

All asset, manifest, and service-worker paths are derived from that base. The
application uses one document URL and state-driven screens, so GitHub Pages
does not need an SPA redirect workaround.

Every push to `main` runs CI and creates a tested Pages artifact. The deploy job
targets the `github-pages` environment and verifies the public HTML after
deployment. `workflow_dispatch` also allows a manual deployment from the
Actions UI.

The generated `dist/` directory is ignored and is never committed; Pages
publishes the immutable artifact uploaded by GitHub Actions.

See the [publishing runbook](docs/publishing.md) for one-time setup, exact
release steps, local repository-path preview, verification, rollback, token
permissions, and service-worker update behavior.

## Local data

Game data stays in browser IndexedDB. Clearing site data removes local games
unless they were exported. Use **Export** before clearing browser storage,
moving devices, or deleting a saved game.

## Specification

| Document                                             | Purpose                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| [Product specification](docs/product-spec.md)        | Goals, scope, workflows, requirements, and release criteria               |
| [Rules and domain](docs/rules-and-domain.md)         | Roll algorithms, turn resolution, Cities & Knights logic, and invariants  |
| [UX specification](docs/ux-spec.md)                  | Screens, interactions, responsive behavior, and accessibility             |
| [Architecture](docs/architecture.md)                 | Technical stack, boundaries, application flow, PWA, and deployment        |
| [Data and reliability](docs/data-and-reliability.md) | Data model, revisions, migrations, recovery, and privacy                  |
| [Testing and delivery](docs/testing-and-delivery.md) | Quality strategy, CI/CD, performance, security, and release gates         |
| [Publishing runbook](docs/publishing.md)             | GitHub Pages setup, releases, verification, troubleshooting, and rollback |
| [Implementation plan](docs/implementation-plan.md)   | Milestones and work packages                                              |
| [Seasons Mode](docs/seasons-mode-plan.md)            | Implemented v0.3.0 design and verification contract                       |
| [Architecture decisions](docs/decisions/)            | Durable design decisions and tradeoffs                                    |

## Architecture

- React 19, TypeScript 5.9, Vite 8
- Pure framework-independent TypeScript domain engine
- IndexedDB via `idb`, runtime validation via Zod
- Immutable full-state revision graph with SHA-256 integrity
- CSS design tokens and native accessible controls
- Vitest, Testing Library, fast-check, Playwright, and axe-core
- `vite-plugin-pwa`, Workbox, GitHub Actions, and GitHub Pages

## Legal

This is an independent, unofficial companion using original branding, icons,
sounds, project-authored event text, and locally generated illustrations. It
does not include CATAN artwork, logos, rulebook text, card text, or copied trade
dress.

CATAN and Cities & Knights are trademarks of their respective owners. Official
rule sources are linked in [rules and domain](docs/rules-and-domain.md).

## License

[MIT](LICENSE)
