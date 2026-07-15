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
- One consolidated roll-result modal containing event, progress, production,
  barbarian, and house-event guidance.
- **Next player & quick roll** directly from the result modal.
- No standalone end-turn button: the next-player roll action records the turn
  boundary and immediately rolls.
- Live current-turn, per-player accumulated, and total active game timers.
- A persisted Pause mode that stops every timer and blocks all controls except
  Resume.
- Progress-card eligibility guidance using the current 2025 improvement board.
- Barbarian movement, verified attacks, tie rewards, live board corrections,
  pillaging, knight reset, and first-attack robber activation.
- Public player scores, cities, metropolises, active knights, and city
  improvements.
- Balanced original thematic events with cooldown and no immediate repeats.
- Immutable IndexedDB revisions with undo, redo, branch retention, integrity
  hashes, and verified-ancestor recovery.
- Versioned JSON export/import that never overwrites an existing game.
- Explicit single-tab control with read-only mirrored tabs and takeover.
- Responsive mobile/tablet/desktop layouts, keyboard support, high contrast,
  reduced motion, synthesized sound cues, and sanitized diagnostics.
- Prompted PWA updates and complete offline operation after first load.

Balanced decks, thematic events, two-player mode, and custom victory targets
are intentionally labeled house rules throughout the application.

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

## Quality commands

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs formatting, linting, type checking, unit tests, and the
production build. Playwright separately exercises desktop/mobile critical
flows, axe accessibility checks, and offline service-worker loading.

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
sounds, and event text. It does not include CATAN artwork, logos, rulebook text,
or card text.

CATAN and Cities & Knights are trademarks of their respective owners. Official
rule sources are linked in [rules and domain](docs/rules-and-domain.md).

## License

[MIT](LICENSE)
