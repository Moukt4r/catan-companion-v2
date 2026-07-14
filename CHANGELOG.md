# Changelog

## 0.1.1 - 2026-07-14

- Replaced sequential roll-resolution dialogs with one consolidated modal.
- Added **Next player & quick roll** to resolve the current result, advance the
  turn, and roll immediately for the next player.
- Fixed concurrent duplicate-save idempotency before checking the expected
  revision head.

## 0.1.0 - 2026-07-12

- Implemented the complete local-first shared-device game companion.
- Added balanced numbered and event-die engines, Alchemy, Cities & Knights
  progress and barbarian assistance, metropolis tracking, and thematic events.
- Added immutable IndexedDB revisions, undo/redo, export/import, corruption
  recovery, multi-tab control, and completed-game summaries.
- Added responsive accessible UI, device preferences, PWA offline/update
  behavior, GitHub Pages deployment, and automated browser validation.
