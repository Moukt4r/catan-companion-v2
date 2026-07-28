# Changelog

## Unreleased

- Metropolis controls now record **how the app learned about them**. A
  correction says the physical board disagrees with the app, so its own tracked
  improvement level is the thing known to be wrong; corrections may therefore
  record a holder below that level, while ordinary improvement proposals still
  enforce it.
- Fixed a schema field the domain never produced, which made a game with an
  open metropolis proposal impossible to save at all.
- The correction dialog no longer refuses a holder below the tracked level. It
  shows what is being overridden instead, naming the recorded level and the
  level the status normally needs.
- A metropolis transfer now clamps the points taken back from the outgoing
  holder, instead of failing whenever that would push a score negative.
- Setup validation scrolls into view and takes focus, so Continue no longer
  looks dead on a phone when a name is missing.
- Preview sound is disabled under the Silent pack, where it did nothing.
- Dice roll speed is disabled whenever motion is actually reduced, including
  when the operating system asks for it rather than the explicit setting.
- Added a **dice roll speed** preference (Snappy / Standard / Relaxed /
  Suspenseful). It paces the JS wait, the flat die pop, and the 3D tumble
  together through CSS custom properties, so a change is felt on the next roll.
  Reduced motion still shows the result immediately and disables the control.
- The setting can be changed live from inside a running game through the header
  menu, and is also offered in the setup wizard.

## 0.7.0 - 2026-07-28

- Added selectable **sound packs**. The cue vocabulary is unchanged; a pack now
  decides how each cue is realised. Workshop (synthesized per playback, the
  default, no downloads) ships alongside Hearth (pre-rendered one-shots) and
  Silent. The pack is chosen in the setup wizard and can be changed at any time
  from Settings.
- Sampled packs load lazily per cue and fall back to the synthesized voice when
  an asset is not yet loaded or fails, so audio never delays a roll and a broken
  deployment degrades to Workshop rather than to silence.
- Added `scripts/build-sound-pack.mjs`, which trims each one-shot to its onset,
  fades the tail, peak-limits, encodes to Opus, and refuses to publish a pack
  that is missing, silent, mistimed, or over its size budget.
- Added a local-first Board Designer with custom terrain, sea, number-token,
  and port inventories; connected manual placement; balanced generation;
  rules-aware warnings; undo/redo; saved designs; and JSON/SVG/PNG/print
  export.
- Added Gold Field terrain and mixed land/sea generation so generated layouts
  can form archipelagos, internal waterways, and adjacent sea regions.
- Prevented automatic generation from creating land islands smaller than three
  hexes and added a warning for undersized manually arranged islands.
- Re-optimized number tokens and coastline ports after topology repairs, and
  kept valid saved designs visible when another local record is malformed.
- Added a border-first workflow with persisted 180-degree symmetric
  footprints, mirrored pair add/remove tools, and generation constrained to
  the adjusted border.
- Added fixed-count width × height border controls and changed the default
  inventory to five of each base resource, two Gold Fields, ten sea, no desert,
  and evenly distributed number tokens.

## 0.6.1 - 2026-07-25

- Removed the barbarian attack resolution form entirely; the physical board is
  now authoritative for all attack outcomes (defender points, progress rewards,
  city losses and knight state). The app signals that barbarians attacked,
  resets its ship cycle, activates the robber after the first attack, and logs
  a board-authoritative history entry without requiring any data entry or
  changing player state.
- Restored one-click Next that advances to the next player **and** auto-rolls.
  Added a direct Alchemy button at the end-of-turn action phase that advances
  to the next player and opens the Alchemy dialog instead of auto-rolling.
- Preserved backward compatibility: existing saves paused in the old attack
  phase are recovered automatically as board-authoritative without changing
  player state.

## 0.6.0 - 2026-07-24

- Replaced the four generic beeps with a procedural offline soundscape for physical dice rolls, each progress discipline, barbarian advances and attacks, World Event categories/tones/impact, and all four season transitions.
- Added outcome-aware barbarian attack audio, rising urgency as the ship approaches, and a unique deterministic identity note for each of the 20 World Events without downloadable audio assets or a larger PWA cache.
- Added a persisted volume preference, an accessible Settings preview, and a one-tap Sound on/off control at the game table.
- Unlock Web Audio synchronously from the first roll gesture for Safari/iOS compatibility while keeping sound opt-in and non-essential to understanding play.

## 0.5.0 - 2026-07-24

- Added a unique FLUX.2 illustration for every one of the 20 built-in World Events.
- Load individual World Event art on demand and retain it in a dedicated CacheFirst runtime cache; the five pack illustrations remain precached offline fallbacks.
- Kept the seasonal landscape in the roll-stage hero throughout the complete turn, eliminating duplicate official-event art between the hero and event die.
- Compressed World Event pack selection into a responsive two-column setup grid with denser mobile cards.
- Exposed stable event IDs to the presentation layer so pending and active cards resolve the correct unique illustration without changing domain rules.

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
