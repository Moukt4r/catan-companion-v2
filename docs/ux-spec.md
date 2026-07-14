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

| Setting         | Default                               |
| --------------- | ------------------------------------- |
| Ruleset         | Base game + Cities & Knights          |
| Numbered dice   | Balanced 36-outcome deck (house rule) |
| Event die       | Balanced six-face deck (house rule)   |
| Thematic events | Standard cadence (house rule)         |
| Victory target  | 13                                    |

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
- save-state indicator;
- connection status only when relevant;
- compact overflow menu.

The save indicator states Saving, Saved, or Save failed. Save failure remains
visible and blocks risky navigation until resolved or exported.

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

Each player card shows:

- name and color label;
- public victory points;
- ordinary cities and derived discipline-specific metropolises;
- active knight strength;
- three improvement levels;
- current-player marker.

Tap or keyboard-activate a card to open its editor. On wide screens, all cards
are visible in turn order. On narrow screens, use a horizontal snap list with
the current player first in the viewport; do not hide other players behind a
carousel with inaccessible controls.

### 5.5 Action controls

The action phase presents quick actions for the current player:

- score adjustment;
- ordinary-city adjustment;
- active knight counters;
- improvement levels, with a confirmed metropolis proposal when applicable;
- End turn.

Every adjustment previews the resulting derived strength or score and supports
Cancel. High-frequency plus/minus controls must also allow direct numeric entry
for keyboard and assistive-technology users.

## 6. Roll result flow

Each roll opens one consolidated modal. It contains all applicable sections at
once rather than opening a sequence of progress, production, attack, and
thematic-event dialogs:

1. **Event result**
   - Barbarian: animate one track step.
   - Progress discipline: show icon and discipline name.
2. **Official consequence**
   - Attack resolution, or eligible progress-card players.
3. **Numbered result**
   - Production total or 7 guidance.
4. **House event**
   - Show only when scheduled, with an unmistakable House event label.

The footer has two actions:

- **Continue current turn** acknowledges the displayed information and enters
  the current player's action phase.
- **Next: PLAYER & quick roll** acknowledges the displayed information, ends
  the current turn, and immediately rolls for the next player. Its helper text
  makes clear that the current player should first finish physical-board
  actions.

The modal stays open while attack choices or persistence are incomplete. A
quick roll replaces its content with the next player's result instead of
opening another modal.

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

## 9. Thematic event experience

The house-event section inside the consolidated modal must look visually
distinct from official resolution:

- persistent House event label;
- original title and concise instruction;
- optional category and intensity marker;
- no countdown or auto-dismiss;
- acknowledgement through the same modal footer as the official result.

The event must fit without scrolling at 320 CSS pixels wide when text is at
200 percent zoom, or provide a clear internal scroll region with focus
management.

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
- Player cards in horizontal snap list.
- Barbarian panel collapses to a status row.
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

- Use short imperative labels: Roll, Resolve attack, End turn.
- Name official and house behavior explicitly.
- State consequences before confirmation.
- Avoid jargon such as cursor, revision conflict, or IndexedDB in normal UI.
- Never blame the user for a storage or validation failure.
