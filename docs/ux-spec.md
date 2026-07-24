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

- Sound: off by default until enabled through a user gesture.
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
- a viewport-fixed **Next: PLAYER & roll** dock, which is the only action-phase
  turn transition.

Every adjustment previews the resulting derived strength or score and supports
Cancel. High-frequency plus/minus controls must also allow direct numeric entry
for keyboard and assistive-technology users.

## 6. Roll result flow

Ordinary rolls resolve inline on the game table:

1. Show numbered dice, official event-die result, production/7 guidance, and
   progress eligibility.
2. If a barbarian attack requires verification or choices, open the blocking
   attack dialog. Do not reveal a pending World Event inside that dialog.
3. After official resolution completes, show a scheduled World Event inline
   with an unmistakable **World Event (house rule)** label.
4. The table acknowledges the World Event before entering the action phase.
5. The viewport-fixed **Next: PLAYER & roll** action records the turn boundary
   and rolls for the next player.

Controls remain disabled while persistence is incomplete. A blocking dialog is
reserved for barbarian attacks or other decisions that cannot safely resolve
inline.

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

Attack resolution occupies one section of the consolidated roll modal and
prevents the footer actions until required tie choices are complete.

### Step 1: Verify inputs

Show a per-player table:

| Player | Ordinary cities | Held metropolises | Active knights | Strength |
| ------ | --------------- | ----------------- | -------------- | -------- |

Each value has an Edit link. The operator confirms that the physical board and
app match before calculation is accepted.

### Step 2: Outcome

Show barbarian and defender strengths with the comparison.

For a successful defense:

- identify the unique highest contributor and proposed +1 point; or
- list tied highest contributors and instruct each to choose a progress deck.

For a barbarian victory:

- list proposed players whose ordinary cities are pillaged;
- explain why protected-metropolis-only players were skipped;
- let the operator correct city selection before confirmation.

### Step 3: Confirm through the modal footer

The footer action summarizes and commits every mutation:

- score changes;
- ordinary city changes;
- ship reset;
- all active knight counters reset;
- robber activation when applicable.

The operator may temporarily open the public-state editor from an attack row;
closing it returns to the same recalculated result modal.

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
- Dice use original SVG geometry and symbols.
- Avoid parchment textures, copied hex art, official iconography, and branded
  audio.

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

- Use short imperative labels: Roll, Continue current turn, Next: PLAYER &
  roll.
- Name official and house behavior explicitly.
- State consequences before confirmation.
- Avoid jargon such as cursor, revision conflict, or IndexedDB in normal UI.
- Never blame the user for a storage or validation failure.
