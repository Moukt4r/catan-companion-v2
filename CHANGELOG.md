# Changelog

## Unreleased

## 0.4.0 - 2026-07-24

- Added a cohesive 13-image **FLUX.2 Dev** visual system: four official event-die outcomes, four seasons, and five World Event category packs.
- Rebuilt event-die faces as illustrated result tiles while preserving complete textual and screen-reader labels.
- Made the roll-stage banner respond to the current season before a roll and the official event outcome after a roll.
- Added compact season-transition art, World Event pack imagery on pending and active event cards, and illustrated setup previews.
- Added event art to the consolidated roll-resolution view without moving consequence text or controls out of their existing hierarchy.
- Kept all generated imagery decorative, lazy-loaded list art, hidden in high-contrast/forced-colors modes, and documented exact model prompts, seeds, and regeneration steps.

## 0.3.0 - 2026-07-24

- Added **Seasons Mode**: an optional house-rule layer over World Events that
  biases category selection based on a four-season cycle tied to round
  progression.
- Setup configuration: enable/disable, rounds per season (2/3/4), starting
  season (spring/summer/autumn/winter). Disabled when World Events are off.
- Deterministic weighted-without-replacement event selection using seasonal
  category weights (favored 1.5×, neutral 1.0×, reduced 0.5×, hard minimum
  0.25×). Existing guardrails (tone-run, impact anti-clump, anti-repeat)
  outrank seasonal weighting.
- Compact in-game season indicator with current season icon, label, and
  round-within-season counter.
- Accessible polite live-region announcement when the season changes at a
  round boundary.
- Backward compatible: old saves without seasonConfig load as Seasons Off;
  new saves round-trip correctly. No mid-game enabling.
- Comprehensive test coverage for season derivation, transitions, weighted
  selection determinism, persistence, and view mapping.

## 0.2.0 - 2026-07-24

- Rebuilt thematic house events as **World Events**: 20 original typed events
  across five selectable packs, with Off/Subtle/Standard/Lively cadence.
- Added tone/impact balancing, prerequisite metadata, deterministic anti-clump
  ordering, and five explicit effect lifecycles.
- Added persistent active-event cards, fair next-round activation for global
  effects, manual resolution for durable effects, and durable event history.
- Preserved version-1 saves with optional metadata and schema defaults; new
  games use document version 2.
- Added a documented, original Seasons Mode proposal without implementing it.
- Refreshed the full interface with a cleaner warm-tabletop visual system and
  original locally generated frontier illustrations.
- Improved active-game hierarchy, setup flow, responsive touch targets, and
  dark/high-contrast accessibility.
- Removed the roll-result modal from ordinary turns in favor of inline guidance
  and kept blocking dialogs only for barbarian attacks that require decisions.
- Removed expensive setup-screen paint effects on touch devices for responsive
  typing and scrolling.
- Collapsed the mobile barbarian panel to an always-visible risk summary while
  keeping the full track one tap away.
- Reworked active play around compact points-and-time tiles, one-tap score
  changes, and a viewport-fixed next-turn action.
- Moved public point adjustments to the top of the player editor and collapsed
  infrequent Cities & Knights bookkeeping behind an advanced disclosure.

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
