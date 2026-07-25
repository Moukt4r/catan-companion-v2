# UX and Accessibility Specification

## 1. Experience objective

The shared device should feel like a clear table instrument, not a dashboard
that competes with the physical game. The primary action must always be obvious
from across the table, and every result must be understandable without reading
small print.

The UI prioritizes:

1. current player;
2. current phase;
3. roll or resolution action;
4. barbarian risk;
5. public player state;
6. history and settings.

## 2. Information architecture

```text
Home
  Resume game
  New game
  Import backup
  Completed games
  Settings / About

Setup
  Players
  Rules and house rules
  Preferences
  Review and start

Game
  Table view
  Consolidated roll result
  Player-state editor
  History / undo
  Backup / settings

Game complete
  Winner
  Summary
  Export
  Archive
```

The implementation uses screen state rather than path-based navigation, which
avoids GitHub Pages deep-link failures and keeps the active game at one URL.

## 3. Home screen

### Active game card

When an active game exists, it is the first focusable item and shows:

- player names;
- current player and round;
- last saved relative time;
- offline-ready status;
- Resume button;
- overflow actions for export, archive, and delete.

Delete requires typing or selecting a confirmation phrase. Starting a new game
offers Archive and start, Export and start, or Cancel.

### Empty state

The empty state explains in one sentence that the app uses one shared device
and saves locally. The main action is Start new game.

## 4. Setup wizard

### Step 1: Players

- Start with four rows in standard mode; unused rows can be removed down to
  three.
- Two-player mode is behind a clearly labeled house-rule choice.
- Each row contains name, color swatch, and drag/reorder controls with keyboard
  alternatives.
- A "Randomize first player" action may use secure randomness but must display
  and save the selected player before setup confirmation.
- Color choices include text or icon labels and are checked for contrast and
  mutual distinguishability.

### Step 2: Rules

Display a comparison panel:

| Setting        | Default                               |
| -------------- | ------------------------------------- |
| Ruleset        | Base game + Cities & Knights          |
| Numbered dice  | Balanced 36-outcome deck (house rule) |
| Event die      | Balanced six-face deck (house rule)   |
| World Events   | Standard, all five packs (house rule) |
| Victory target | 13                                    |

The balanced modes are fixed for this release and explained rather than
toggleable.

### Step 3: Preferences

- Sound effects: off by default until enabled through a user gesture; volume is
  persisted per device and can be previewed before play.
- Motion: system preference by default.
- Theme: system, light, dark, or high contrast.
- Keep screen awake: request only after the game starts and explain browser
  support.
- Fullscreen: optional progressive enhancement.

### Step 4: Review

Show player order, initial public scores, active house rules, and event cadence.
The Start game button creates and saves the game before navigating to the table.

## 5. Table view

### 5.1 Header

The sticky header contains:

- current player name and accessible color marker;
- round and turn number;
- live current-turn and total active-game clocks;
- save-state indicator;
- connection status only when relevant;
- compact overflow menu.

The save indicator states Saving, Saved, or Save failed. Save failure remains
visible and blocks risky navigation until resolved or exported.

The header also exposes Pause. Pausing immediately freezes the current turn,
the current player's accumulated time, and total active game time.

### 5.2 Roll stage

The center stage contains:

- red numbered die;
- yellow numbered die;
- event die;
- production total;
- one large phase action.

Before rolling:

- primary action: Roll;
- secondary action: Use Alchemy;
- helper text: current player and balanced-cycle progress.

After rolling:

- animate toward the already persisted result;
- show text and symbols, not color alone;
- announce the full result once through an `aria-live="polite"` region;
- replace Roll with the next required resolution action.

The UI never displays decorative dice that disagree with the text result.

### 5.2.1 Sound feedback

Sound is an optional enhancement and never the only carrier of game state:

- the first roll gesture synchronously unlocks Web Audio for Safari/iOS;
- a tactile rattle represents the physical dice before the persisted result;
- Science, Trade, and Politics each use a distinct short signature;
- barbarian movement gains urgency near the city, while an attack uses drums,
  impact, and an outcome-aware final phrase;
- World Events combine category, tone, impact, and an event-specific identity
  note into a short procedural cue;
- each season transition uses its own chime palette;
- all effects are synthesized locally, add no network requests, and remain
  available offline;
- a table-level Sound on/off control, Settings volume slider, and explicit
  preview keep control with the device owner.

Every audible state also remains visible in text, color-independent symbols,
and the existing live-region announcements.

### 5.3 Barbarian panel

Always visible on tablet and desktop; collapsible but status-visible on mobile.
It shows:

- track position and spaces remaining;
- barbarian strength;
- defender strength;
- risk label: Safe, Tied, or Exposed;
- per-player active contribution in a compact list.

Risk uses icon, text, and shape in addition to color.

### 5.4 Player strip

Each compact player tile shows:

- name and color label;
- public victory points;
- elapsed active-play time;
- current-player marker.

One-tap minus and plus controls adjust public points during the action phase.
The Details action opens the full editor for corrections, cities, knights, and
improvement levels. On wide screens, all tiles are visible in turn order. On
narrow screens, use a compact horizontal snap list with the current player
first in the viewport; do not hide other players behind a carousel with
inaccessible controls.

### 5.5 Action controls

The action phase presents:

- one-tap score adjustment on every player tile;
- a points-first editor with Cities & Knights state behind an advanced
  disclosure;
- a viewport-fixed turn dock with **Next: PLAYER** for the normal one-click
  advance-and-roll path and **Alchemy: PLAYER** as the direct alternative.

Every adjustment previews the resulting derived strength or score and supports
Cancel. High-frequency plus/minus controls must also allow direct numeric entry
for keyboard and assistive-technology users.

## 6. Roll result flow

Ordinary rolls resolve inline on the game table:

1. Show numbered dice, official event-die result, production/7 guidance, and
   progress eligibility.
2. If the barbarian ship reaches the final space, announce and log the attack
   without asking the table to duplicate its physical-board resolution.
3. After official resolution completes, show a scheduled World Event inline
   with an unmistakable **World Event (house rule)** label.
4. The table acknowledges the World Event before entering the action phase.
5. **Next: PLAYER** records the turn boundary and rolls for the next player in
   one click. **Alchemy: PLAYER** records the same boundary and opens Alchemy
   for that player instead of rolling.

Controls remain disabled while persistence is incomplete. No blocking dialog
is used for a new barbarian attack.

## 7. Progress eligibility sheet

Display:

- event discipline;
- red die value;
- eligible players in draw order;
- each eligible player's recorded level and matching range;
- a reminder that cards remain private and are not tracked.

If no player is eligible, state this explicitly. Eligibility is acknowledged
with the consolidated modal's footer action rather than a separate button or
dialog.

## 8. Barbarian attack experience

The app does not present an attack-resolution form. When the ship reaches the
final space, it announces the attack, resets the app's ship cycle, activates
the robber after the first attack, and continues the normal roll-resolution
flow.

The physical table remains authoritative for active knights, the outcome,
Defender points, tied progress rewards, city losses, and all scoring. The app
does not ask players to enter those decisions and does not change player
scores, cities, or knight counters as a side effect of the attack.

Legacy saves already paused in the old attack-resolution phase recover
automatically without showing the form or changing player state. New attacks
never enter that phase.

## 9. World Event experience

A pending World Event appears inline only after official resolution:

- persistent **World Event (house rule)** label;
- original title and precise physical-table instruction;
- tone, impact, and timing/expiry copy;
- explicit acknowledgement; no countdown or auto-dismiss.

After acknowledgement, non-immediate events move to the persistent **Active
World Events** section. Deferred full-round events say when they activate;
automatic durations show their expiry; `until-resolved` events alone expose a
**Mark resolved** action. Read-only, paused, and saving states disable that
action.

The pending card and active-event list must remain readable at 320 CSS pixels
and 200 percent zoom without viewport overflow. High-contrast presentation
must not rely on tone color alone.

## 10. History and undo

History is a chronological sheet grouped by round. Entries include:

- time;
- player;
- action;
- result summary;
- house-rule marker where relevant;
- revision number.

The latest reversible entry exposes Undo. Undo opens a summary of everything
that will change. After undo, offer Redo until a new branch-changing action is
accepted. Branching history requires explicit confirmation and remains visible
in the exported audit record.

## 10.1 Pause experience

Pause may be selected from the game header or consolidated roll modal. The
active dialog is replaced by a blocking **Game paused** dialog containing:

- the frozen current-turn time;
- the frozen total active-game time;
- current player identity;
- one Resume action.

The modal makes every other control inert. Paused intervals never contribute
to total or per-player time, and resuming returns to the exact prior phase.

## 11. Error and recovery UX

### Recoverable command error

Show an inline error next to the attempted action. Keep the current state and
focus the error summary.

### Persistence failure

- Display a persistent blocking banner.
- Keep the unsaved next state in memory.
- Offer Retry save, Export emergency backup, or Revert unsaved action.
- Do not allow another state-changing command until the failure is resolved.

### Corrupt current game

- Never reset automatically.
- Offer restore last verified revision, export raw diagnostic backup, or return
  home.
- Preserve the corrupt record for support until the user explicitly deletes it.

### Unsupported import

Explain the schema version and validation issue. Do not modify existing data.

## 12. Responsive layout

### Mobile portrait: 320-599 px

- Single-column flow.
- Sticky current-player header.
- Dice and primary action above the fold.
- Compact points-and-time tiles in a horizontal snap list.
- Barbarian panel collapses to a status row.
- Next-turn action remains fixed above the bottom safe area.
- Bottom sheets use the full viewport and safe-area insets.

### Tablet and small desktop: 600-1199 px

- Two-column table: roll stage plus persistent barbarian/player context.
- Player strip spans full width.
- Primary target for game-night use.

### Large desktop: 1200 px and above

- Centered maximum content width.
- Three-region layout: players, roll stage, barbarian/history context.
- Do not scale controls down merely to fill more columns.

Landscape and portrait changes must not reset animation, close required
resolution, or alter domain state.

## 13. Visual design

- Use an original neutral tabletop theme, not CATAN trade dress.
- Use system fonts or appropriately licensed bundled fonts.
- Use CSS custom properties for color, spacing, typography, elevation, motion,
  and focus rings.
- Player colors come from a tested palette and always pair with a name or
  symbol.
- Numeric dice use original CSS geometry. Event-die outcomes pair an original
  symbol with decorative FLUX.2 art while retaining a complete textual label.
- The core 13-image FLUX.2 system uses four official-event motifs, four seasonal
  landscapes, and five World Event pack illustrations. Each of the 20 built-in
  World Events additionally has a unique illustration loaded on demand.
- Unique event art is excluded from the install-time precache and stored in a
  20-entry CacheFirst runtime cache after first use. Precached pack art is the
  offline fallback when an event image has not been seen yet.
- Artwork is a subdued accent: consequence text, timing, controls, and
  house-rule labels always remain visually and semantically primary.
- Decorative imagery uses empty alt text, is hidden in high-contrast and
  forced-colors modes, and never becomes the only carrier of state.
- Responsive crops use shallow banners or stamps below 600 px so imagery never
  pushes the primary roll/continue action out of the usable flow.
- Avoid parchment textures, copied hex art, official iconography, recognizable
  commercial pieces, and branded audio.

## 14. Motion and audio

### Motion

- Default roll animation: 600-900 ms.
- Reduced-motion mode: a brief crossfade under 150 ms or immediate result.
- No physics simulation controls the outcome.
- Avoid continuous animation during the action phase.

### Audio

- Audio begins only after explicit opt-in.
- Provide distinct, original, licensed sounds for roll, barbarian advance,
  event, and confirmation.
- Every audio cue has an equivalent visual cue.
- Audio failure is non-fatal and must not delay resolution.

## 15. Accessibility requirements

- Semantic headings, landmarks, buttons, dialogs, tables, and forms.
- Visible focus at least 2 CSS pixels thick with sufficient contrast.
- Logical focus order that follows the current phase.
- Dialog focus trap, labelled title/description, and return focus.
- No hover-only information.
- Support 200 percent text zoom and browser reflow at 320 CSS pixels.
- Text contrast at least 4.5:1; large text and non-text controls at least 3:1.
- Status messages use appropriate polite or assertive live regions without
  duplicate announcements.
- Touch targets at least 44 by 44 CSS pixels with adequate separation.
- Automated axe checks plus keyboard, VoiceOver, NVDA, and TalkBack spot checks
  before release.

## 16. Content style

- Use short imperative labels: Roll, Continue current turn, Next: PLAYER,
  Alchemy: PLAYER.
- Name official and house behavior explicitly.
- State consequences before confirmation.
- Avoid jargon such as cursor, revision conflict, or IndexedDB in normal UI.
- Never blame the user for a storage or validation failure.
