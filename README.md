# Catan Table Companion

A local-first, installable web companion for one shared-device game of base
CATAN with Cities & Knights. It is designed for static hosting on GitHub Pages
and requires no account, server, or internet connection after installation.

This repository currently contains the implementation specification. No code
from the earlier `agentic-catan` prototype is copied into this project.

## Product decisions

- One shared phone, tablet, or laptop is the source of truth for the game.
- The app assists a physical board game; it does not recreate the board.
- Resource dice use a shuffled deck containing all 36 ordered outcomes once.
- The Cities & Knights event die uses a shuffled six-face deck containing
  three barbarian faces and one face for each progress discipline.
- Thematic house events are a first-class game feature.
- The application is offline-capable and deployable as static GitHub Pages.
- Game state is saved after every action and can be exported, imported, and
  undone.

Balanced decks and thematic events are intentional house rules and are always
identified as such in the UI.

## Specification

| Document | Purpose |
| --- | --- |
| [Product specification](docs/product-spec.md) | Goals, scope, workflows, requirements, and release criteria |
| [Rules and domain](docs/rules-and-domain.md) | Roll algorithms, turn resolution, Cities & Knights logic, and invariants |
| [UX specification](docs/ux-spec.md) | Screens, interactions, responsive behavior, and accessibility |
| [Architecture](docs/architecture.md) | Technical stack, boundaries, application flow, PWA, and deployment |
| [Data and reliability](docs/data-and-reliability.md) | Data model, persistence, revisions, migrations, recovery, and privacy |
| [Testing and delivery](docs/testing-and-delivery.md) | Quality strategy, CI/CD, performance, security, and release gates |
| [Implementation plan](docs/implementation-plan.md) | Ordered milestones and definitions of done |
| [Architecture decisions](docs/decisions/) | Durable design decisions and their tradeoffs |

## Intended implementation stack

- React, TypeScript, and Vite
- Pure TypeScript domain engine
- IndexedDB through a small repository adapter
- Zod validation at persistence and import boundaries
- CSS Modules and design tokens
- Vitest, Testing Library, fast-check, and Playwright
- `vite-plugin-pwa` with a user-controlled update flow
- GitHub Actions and GitHub Pages

Exact dependency versions will be pinned when implementation begins.

## Legal

This is an independent, unofficial companion. It must use original branding,
icons, illustrations, sounds, and event text. It must not ship CATAN artwork,
logos, rulebook text, card text, or other proprietary assets.

CATAN and Cities & Knights are trademarks of their respective owners. Rule
behavior should be verified against the official materials linked in
[rules and domain](docs/rules-and-domain.md).

## License

[MIT](LICENSE)
