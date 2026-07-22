# Changelog

## 0.1.4 - 2026-07-22

- Stopped archived and replaced games from accumulating active-play time, and
  resumed archived clocks from a durable pause revision.
- Added blocking failed-save recovery with idempotent retry, importable
  emergency export, and explicit revert.
- Hardened corrupt revision recovery against missing links and cyclic ancestry.
- Added a local-storage lease fallback for read-only multi-tab coordination
  when Web Locks are unavailable, with ownership revalidation before writes.
- Requested persistent browser storage whenever a game starts, independently
  of the wake-lock preference.
- Enforced application/domain coverage and dependency boundaries, added a
  production CSP, and expanded browser automation to Firefox and WebKit.

## 0.1.3 - 2026-07-14

- Added live current-turn and total active-game clocks.
- Added accumulated active time for each player.
- Added persisted pause/resume controls that exclude breaks from every timer and
  disable all other game controls.

## 0.1.2 - 2026-07-14

- Removed the standalone End turn control.
- Made **Next: PLAYER & roll** the only action-phase turn transition.

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
