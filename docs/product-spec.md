# Product Specification

Status: approved implementation baseline
Target: first production release
Hosting: static GitHub Pages
Primary device: one shared tablet, phone, or laptop

## 1. Product statement

Catan Table Companion is a shared-screen assistant for a physical game of base
CATAN with Cities & Knights. It replaces the three dice and shared bookkeeping
that is easy to miss, while leaving the board, pieces, cards, resources,
trading, and player decisions on the table.

The application must be quick enough that using it is easier than handling
physical dice and counters. It must remain usable without a network, survive a
reload or device sleep, and make every automated decision visible and
reversible.

## 2. Fixed product decisions

These decisions define the first release:

1. The application is a client-only web application hosted on GitHub Pages.
2. One shared device owns the active game. There are no accounts, rooms, or
   multiplayer synchronization.
3. The supported ruleset is base CATAN with Cities & Knights.
4. The two numbered dice use a shuffled 36-outcome deck rather than independent
   random rolls.
5. The event die uses a shuffled six-face deck rather than independent random
   rolls.
6. Thematic events are part of the core experience and are enabled by default.
7. The balanced decks and thematic events are house rules and must be labeled
   as such.
8. The earlier prototype is a reference for intent and its canonical
   `utils/events.ts` house-rule catalog only. Its code, structure, assets, and
   implementation compromises are not inherited.

## 3. Goals

- Make one turn's roll and shared resolution clear in a single interaction.
- Guarantee exact coverage of the selected balanced roll cycles.
- Correctly assist with event-die progress eligibility and barbarian attacks.
- Track only public information that reduces table bookkeeping.
- Preserve every accepted action and support safe undo.
- Resume the current game after refresh, browser restart, or temporary loss of
  connectivity.
- Work comfortably in tablet landscape, mobile portrait, and desktop layouts.
- Meet WCAG 2.2 AA and respect reduced-motion and muted-audio preferences.
- Deploy and update safely through GitHub Pages without a backend.

## 4. Non-goals

The first release will not:

- render or simulate the game board;
- track private resource, commodity, development, or progress-card hands;
- perform trades or validate building placement;
- implement online multiplayer, accounts, cloud backup, or spectators;
- reproduce official artwork, rulebook text, card text, sounds, or trade dress;
- support Seafarers, Traders & Barbarians, Explorers & Pirates, or the 5-6
  player extensions;
- use a physics engine to determine dice results;
- provide AI strategy recommendations.

## 5. Users and environment

### Primary user

One player acts as the device operator, although any player may use the shared
screen. The operator needs large controls, minimal text entry after setup, and
clear prompts that can be read aloud to the table.

### Supported table modes

- Three or four players: supported as the standard Cities & Knights game.
- Two players: available only as an explicitly labeled house-rule setup.
- Victory target: 13 points by default. A custom target is an advanced house
  setting and is recorded in the game history.

### Expected sessions

- Typical duration: 60 to 240 minutes.
- Typical rolls: 30 to 120.
- The device may sleep, rotate, switch apps, lose connectivity, or reload.
- The app may be installed as a PWA or used directly in the browser.

## 6. Product principles

1. **Result first:** persist the authoritative result before any animation.
2. **Official before optional:** resolve official Cities & Knights steps before
   displaying a thematic event.
3. **Public state only:** do not require players to enter private information.
4. **No hidden mutation:** every automatic state change appears in the result
   summary and history.
5. **Undo is normal:** accidental taps must be recoverable without restarting.
6. **Offline is the default:** network access is never required during a game.
7. **Progressive enhancement:** sound, wake lock, fullscreen, and richer
   animation may improve the experience but never gate play.

## 7. Game lifecycle

### 7.1 Home

The home screen offers:

- Resume current game, including last saved turn and timestamp.
- Start new game.
- Import game backup.
- View completed game summaries.
- Open settings and legal information.

Starting a new game while another game is active requires an explicit choice
to archive or delete the current game. No active game is silently replaced.

### 7.2 Setup

The setup wizard collects:

- two to four unique player names;
- accessible player colors and turn order;
- first player;
- official or two-player house mode;
- 13-point or custom victory target;
- thematic event frequency;
- sound and animation preferences;
- optional initial public-state adjustments.

For standard Cities & Knights setup, each player begins with one settlement,
one city, and three public victory points. The operator can correct these
values before confirming.

The confirmation screen summarizes all house rules before the game begins.

### 7.3 Active turn

The game screen always shows:

- current player and round;
- last numbered-dice result and event-die result;
- barbarian distance and current attack/defense strengths;
- public player scores and shared Cities & Knights counters;
- a single primary action appropriate to the current phase;
- undo, history, settings, and backup access.

The turn state machine is:

1. `awaiting-roll`
2. `resolving-official-result`
3. `resolving-barbarian-attack` when required
4. `resolving-thematic-event` when triggered
5. `action-phase`
6. `turn-complete`

The app cannot roll twice in one turn unless the previous roll is undone.

### 7.4 End game

When a player reaches the configured target, the app asks the table to confirm
the winner rather than ending automatically. Confirmation archives:

- winner and final public scores;
- duration, turns, rounds, and roll statistics;
- barbarian attack outcomes;
- triggered thematic events;
- active house-rule configuration;
- an exportable game record.

## 8. Functional requirements

### FR-01: New game and setup

- Validate player count, unique names, unique distinguishable colors, and turn
  order.
- Offer standard defaults without requiring advanced configuration.
- Display all active house rules before confirmation.
- Save the game immediately after setup.

### FR-02: Balanced numbered dice

- Generate all 36 ordered red/yellow die pairs exactly once per cycle.
- Shuffle each cycle with a cryptographically secure unbiased algorithm.
- Persist the complete cycle and cursor before displaying the first result.
- Never expose future outcomes in normal UI.
- Begin a new independently shuffled cycle after outcome 36.

### FR-03: Balanced event die

- Generate exactly three barbarian, one science, one trade, and one politics
  face per six-result cycle.
- Shuffle and persist it independently from the numbered-dice cycle.
- Draw one event face for every normal turn roll and every Alchemy-assisted
  roll.

### FR-04: Atomic roll

- A roll creates one durable transaction containing the numbered result, event
  face, current player, turn, cycle positions, and derived official effects.
- The authoritative transaction is saved before animation or sound starts.
- Reloading during animation restores the accepted result and resolution phase.

### FR-05: Alchemy support

- Before rolling, the current player may choose "Use Alchemy."
- The operator selects valid red and yellow values from 1 through 6.
- The chosen pair does not consume an outcome from the balanced numbered deck.
- The event die still consumes its next balanced result.
- The history labels the result as player-selected.

### FR-06: Official result guidance

- Resolve and present event-die effects before production guidance.
- Present every consequence of one roll in a single consolidated result modal;
  do not require a chain of acknowledgement dialogs.
- On a progress icon, identify every player eligible for that discipline based
  on the red die and recorded improvement level.
- On a 7, show robber/discard guidance rather than production guidance.
- Before the first barbarian attack, show that the robber is not yet active.
- After the first barbarian attack, record that the robber has become active.

### FR-07: Public player state

Each player has editable public counters for:

- total victory points with an auditable adjustment ledger;
- ordinary cities;
- active basic, strong, and mighty knights;
- science, trade, and politics improvement levels from 0 through 5.

The game separately tracks one possible metropolis holder for each discipline,
including whether control is temporary or permanent. Improvement edits can
propose a metropolis assignment or transfer, and a dedicated correction flow
handles physical-board discrepancies. Metropolis count, active knight strength,
and vulnerable city count are derived rather than independently editable.

### FR-08: Barbarian assistance

- Advance the barbarian ship when the event result is barbarian.
- Open attack resolution immediately when the final track space is reached.
- Calculate barbarian and defender strengths from current public state.
- Calculate the official winning reward or losing pillage candidates.
- Require operator confirmation before changing scores or city counts.
- Reset the ship and deactivate all active knights after confirmed resolution.
- Keep attack resolution atomic and undoable.

### FR-09: Thematic events

- Enable the predecessor app's canonical 30-event catalog by default.
- Trigger events through a balanced cadence system, not independent percentage
  rolls.
- Never interrupt unresolved official result or barbarian resolution.
- Avoid immediate event repetition.
- Present each event as an instruction that the table acknowledges.
- Record the event and acknowledgement in history.
- Allow event frequency to be changed only through a confirmed settings action
  that is recorded in history.

### FR-10: Turn management

- Do not expose a standalone End turn action.
- The action-phase **Next: PLAYER & roll** control ends the current turn and
  immediately rolls for the next player.
- Advance clockwise and increment the round after the final player.
- Keep quick public-state controls available during the action phase.
- Offer **Next player & quick roll** in the consolidated result modal. This
  acknowledges the displayed result, ends the current turn, and immediately
  rolls for the next player.
- Announce the next player visually and through an accessible live region.

### FR-11: History and undo

- Record every state-changing action with actor, time, before/after revision,
  and a human-readable description.
- Allow undo of the latest reversible action.
- Undo restores deck cursors and every derived effect, not only visible
  counters.
- Require confirmation for undoing an attack, ending a game, deleting a game,
  or replacing data through import.
- Never silently discard future history after navigating to an earlier
  revision.

### FR-12: Persistence and recovery

- Save every accepted command in one IndexedDB transaction.
- Resume without data loss after refresh, browser restart, or PWA update.
- Detect a second tab and make it read-only unless the user explicitly takes
  control.
- Export a versioned JSON backup without private browser metadata.
- Validate imports before modifying local data.
- Keep the previous valid snapshot if a migration or write fails.

### FR-13: Offline PWA

- Install on supported mobile and desktop browsers.
- Load and run the complete active-game flow offline after the first visit.
- Show connection state without treating offline as an error.
- Prompt for application updates and never force a reload during an unresolved
  turn.

### FR-14: Accessibility

- Meet WCAG 2.2 AA for the complete critical flow.
- Support keyboard-only and switch-input operation.
- Use minimum 44 by 44 CSS-pixel targets for primary table controls.
- Never encode player identity or event meaning by color alone.
- Provide reduced-motion behavior and a no-audio path.
- Announce roll results, phase changes, errors, and save failures.

### FR-15: Settings and diagnostics

- Expose animation, sound, wake lock, theme, and event cadence.
- Show application version, schema version, storage status, and last save time.
- Provide a safe "copy diagnostics" action that excludes player names and game
  content by default.

### FR-16: Active-play timing and pause

- Track current-turn active time, accumulated active time per player, and total
  active game time.
- Exclude every paused interval from all timers.
- Persist timing and pause state across reloads, browser restarts, and PWA
  updates.
- Continue counting active time while the app is closed or on the Home screen
  unless Pause was selected first.
- Settle and pause the clock before archiving or replacing a game, then resume
  from the current time so archived intervals are excluded.
- Allow Pause during normal play and roll resolution.
- While paused, replace the game UI with a blocking Resume-only dialog so no
  other game action can run.
- Attribute elapsed time to the outgoing player before the next-player roll
  advances the turn.
- Undo and redo restore the corresponding turn owner, so live elapsed time is
  attributed according to the selected game-state timeline.

## 9. UX acceptance scenarios

The first release is acceptable only when all scenarios pass:

1. Four players can start a standard game in under two minutes.
2. A normal turn can be rolled and acknowledged with one primary tap plus only
   the prompts required by its result.
3. Refreshing immediately after tapping Roll shows exactly the same result and
   no deck outcome is skipped.
4. The 36 numbered outcomes are each seen exactly once in one complete cycle.
5. The six event faces occur in the configured 3/1/1/1 counts each cycle.
6. A barbarian victory, defeat, and tied defense are each calculated correctly
   and can be undone.
7. An Alchemy result leaves the numbered-deck cursor unchanged.
8. A progress icon lists eligible players in current turn order.
9. A thematic event never appears before an unresolved barbarian attack.
10. The current game resumes offline after closing and reopening the PWA.
11. Importing malformed or incompatible data leaves the current game intact.
12. A keyboard-only user can complete setup, roll, resolve, adjust state, undo,
    and export.

## 10. Release success criteria

- No known data-loss or incorrect-rule defects.
- All critical automated suites and manual release checks pass.
- Domain rule coverage is at least 95 percent branch coverage.
- Overall tested source coverage is at least 85 percent branch coverage.
- Initial JavaScript is at or below 250 KB gzip unless a reviewed decision
  record approves an exception.
- The game shell loads within 2.5 seconds at the 75th percentile on a
  representative mid-tier mobile profile.
- The installed app completes the critical game flow with networking disabled.
- Lighthouse accessibility score is 100 on the primary screens, supplemented
  by manual assistive-technology checks.

## 11. Future extensions

Future work may add custom thematic events, alternative official expansions,
game statistics, a board-facing display mode, or optional device-to-device
sync. None may weaken local-first operation or require migration of private
player information into the app.
