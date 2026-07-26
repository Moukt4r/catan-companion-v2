# Rules and Domain Specification

## 1. Rule authority and classification

The app combines official assistance with explicit house rules.

### Official behavior summarized by the app

- Base CATAN production totals and 7 reminders.
- Cities & Knights event resolution order.
- Progress-card eligibility guidance.
- Barbarian movement, attack strength, defense strength, rewards, pillage
  candidates, knight deactivation, and robber activation.
- Alchemy choosing the two numbered dice while the event die still rolls.

### Required house rules

- Balanced 36-outcome numbered-dice deck.
- Balanced six-face event-die deck.
- World Events v0.2.0: typed 20-event engine with five selectable packs,
  Off/Subtle/Standard/Lively cadence, tone/impact balance, five lifecycle
  durations, persistent UI, manual resolution, and legacy v1 compatibility.
- Optional two-player and custom-victory-target modes.

The UI must display a "House rule" label anywhere a required house system is
configured or explained. It must never imply that balanced decks or thematic
events are official CATAN rules.

### Sources

Behavior should be checked against the current official materials before each
release:

- [Official CATAN game rules](https://www.catan.com/understand-catan/game-rules)
- [Official Cities & Knights FAQ](https://www.catan.com/faq/cities-knights)
- [2025 Cities & Knights rulebook PDF](https://www.catan.com/sites/default/files/2025-03/CN3087%20CATAN%E2%80%93Cities%26Knights_%20Rulebook.pdf)

The repository may summarize mechanics but must not copy rulebook or card text.

## 2. Domain vocabulary

| Term                   | Meaning                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| Turn                   | One player's roll, resolution, production, and action phase           |
| Round                  | One completed turn for every player in turn order                     |
| Numbered deck          | Shuffled ordered pairs for the red and yellow dice                    |
| Event deck             | Shuffled event-die faces in a 3/1/1/1 distribution                    |
| Roll transaction       | One accepted numbered result, event result, and all derived prompts   |
| Official resolution    | Event movement/progress guidance followed by production or 7 guidance |
| World Event            | Original house-rule instruction shown after official resolution       |
| Vulnerable city        | An ordinary city without a metropolis                                 |
| Active knight strength | Basic count + 2 x strong count + 3 x mighty count                     |
| Barbarian strength     | Ordinary cities + metropolises across all players                     |
| Revision               | Durable state produced by one accepted command                        |

## 3. Core state machine

```text
setup
  -> awaiting-roll
  -> resolving-official-result
       -> resolving-thematic-event (conditional)
       -> action-phase
  -> turn-complete
  -> awaiting-roll (next player)
  -> completed
```

Invalid phase transitions are rejected by the domain engine with a typed error.
The UI must surface the error and retain the last durable revision. Barbarian
attacks never introduce a phase of their own: they are logged when the ship
lands and the turn continues in the normal official-result flow.

## 4. Balanced numbered-dice deck

### 4.1 Deck contents

The cycle contains the Cartesian product:

```text
(red, yellow) where red is 1..6 and yellow is 1..6
```

There are exactly 36 ordered outcomes. `(2, 5)` and `(5, 2)` are distinct,
which matters because the red die is used for progress-card eligibility.

### 4.2 Shuffle

1. Construct the canonical 36-item array.
2. Shuffle with Fisher-Yates.
3. Obtain random indices from `crypto.getRandomValues`.
4. Use rejection sampling so modulo bias is not introduced.
5. Store the shuffled order, cycle number, and cursor before the first draw.

`Math.random` is prohibited in domain randomness.

Every permutation must be possible. The engine must not prevent repeated
totals or repeated pairs across a cycle boundary because doing so biases the
shuffle.

### 4.3 Draw

- A normal roll consumes the item at the current cursor and increments it.
- Cursor 36 closes the cycle. The next normal roll creates and persists a new
  cycle before drawing its first item.
- The UI may show cycle progress such as `12 / 36`, but never remaining faces
  or future values.
- Reload, retry, animation failure, or sound failure must not draw again.

### 4.4 Alchemy

Alchemy is entered before the roll:

- In the action phase, **Alchemy: PLAYER** ends the current turn and opens
  Alchemy directly for the next player; **Next: PLAYER** uses the normal
  one-click advance-and-roll path.
- `awaiting-roll` still presents both Roll and Use Alchemy at game start and in
  resumed or recovered states.
- The player chooses red and yellow values from 1 through 6.
- The selected pair becomes the production result.
- The numbered-deck cursor does not move.
- The event deck draws normally.
- The selected result may be any sum from 2 through 12, including 7.
- History records the selected pair and the Alchemy override.

This preserves exact 36-outcome coverage for results generated by the house
deck while allowing the official card effect to add a chosen result.

## 5. Balanced event-die deck

Each cycle contains:

```text
barbarian
barbarian
barbarian
science
trade
politics
```

The event deck:

- uses the same unbiased secure shuffle abstraction as the numbered deck;
- persists independently with its own cycle and cursor;
- consumes exactly one face for a normal or Alchemy-assisted roll;
- reshuffles only after all six faces are consumed;
- does not expose future faces.

## 6. Atomic roll resolution

A roll command is accepted only in `awaiting-roll`. One durable transaction:

1. verifies the current game and phase;
2. draws or selects the numbered result;
3. draws the event face;
4. records both deck positions;
5. derives event-die consequences;
6. derives production total or 7 guidance;
7. evaluates the thematic trigger schedule;
8. stores the next revision;
9. returns a presentation model for animation.

The app then presents results in this order:

1. event die;
2. barbarian movement and attack, or progress eligibility;
3. numbered-dice production total or 7 reminder;
4. World Event, if scheduled;
5. action phase.

## 7. Progress-card eligibility

The event face selects science, trade, or politics. The red die is compared to
each player's recorded improvement level for that discipline.

The current 2025 board ranges are represented as rules data:

| Improvement level | Eligible red-die values |
| ----------------- | ----------------------- |
| 0                 | none                    |
| 1                 | 1-2                     |
| 2                 | 1-3                     |
| 3                 | 1-4                     |
| 4                 | 1-5                     |
| 5                 | 1-6                     |

Rules data is stored as an explicit lookup table rather than a formula so an
edition correction can be reviewed and tested in isolation.

This table is based on the current 2025 rules board. In particular, its example
states that level 2 is eligible on red values 1, 2, or 3. Secondary summaries
that use a simple `red <= level` rule do not match this edition and must not
replace the versioned lookup without an official-rules review.

Eligible players are listed in turn order beginning with the current player.
The app only tells the table who may draw and from which discipline. It does
not track private progress cards.

Losing the last city does not erase improvement levels. The engine therefore
retains progress eligibility while preventing additional improvement-level
increases until that player again has a city, matching the official FAQ.

## 7.1 Metropolis control

Metropolises are game-level public state, not independent per-player counters.
For each of science, trade, and politics, record:

```ts
type MetropolisControl =
  | { holderId: PlayerId; status: "temporary" }
  | { holderId: PlayerId; status: "permanent" }
  | null;
```

The current rules use this flow:

- The first player to reach level 4 in a discipline may gain temporary control.
- The first player to reach level 5 in that discipline gains permanent control.
- Permanent control does not transfer.
- A player may control more than one discipline, but each metropolis occupies
  a different physical city.
- Gaining control converts one ordinary city into a metropolis and proposes a
  two-point score-ledger increase.
- Losing temporary control converts that metropolis back to an ordinary city
  and proposes the corresponding two-point decrease.

Because the app does not model board locations or commodity payments,
improvement edits that cross level 4 or 5 open a proposal rather than silently
moving a metropolis. The operator confirms the physical-board result. A
separate correction command can repair holder state without pretending a new
improvement was purchased.

## 8. Barbarian track and first attack

- A barbarian event advances the ship one space.
- Reaching the final space records an attack immediately without opening a
  separate resolution phase.
- The first recorded attack sets `robberActivated` to true.
- Before that first attack, a rolled 7 must explain that the robber is not yet
  active under Cities & Knights setup.

Track length is edition rules data, not a magic number in UI code.

## 9. Barbarian attack ownership

The physical board owns the complete attack resolution: knight state,
strength comparison, winner, Defender points, tied progress rewards, city
losses, and score changes. The app does not calculate or collect a new attack
outcome and does not mutate those player-owned values.

### 9.1 Strengths

For each player:

The app does not compute barbarian or defender strength. Cities, city walls
and knights live on the physical board, and mirroring them in the app produced
numbers that could only ever drift out of sync with what the table could see.

### 9.2 Physical-board resolution

Players compare total active knight strength against the barbarian strength
directly on the board, exactly as the rulebook describes. Defender points,
tied progress-card rewards and pillaged cities are all settled there.

The app asks for nothing and records no outcome.

### 9.3 Return home

When the ship reaches the final space:

- reset the barbarian ship to its start;
- mark the robber active if this was the first attack;
- append the fact that an attack happened, with its timestamp;
- leave player scores and every board-owned counter untouched.

Saves paused in the removed attack-resolution phase are completed on load: the
attack is logged, the ship resets, and the turn resumes in a phase that still
exists.

## 10. Public player-state invariants

- Player IDs are immutable and independent of display names.
- Names are non-empty and unique under trimmed, case-insensitive comparison.
- Colors must pass pairwise distinguishability checks and have text labels.
- Ordinary cities are non-negative integers.
- There is at most one metropolis holder per discipline and at most three
  metropolises total.
- Every metropolis holder references an existing player.
- A temporary holder has reached at least level 4 in that discipline; a
  permanent holder has reached level 5, except while an explicit correction is
  being confirmed.
- Permanent control cannot transfer through a normal improvement command.
- A player's derived metropolis count plus ordinary-city count represents the
  public city pieces recorded for that player.
- Active basic, strong, and mighty knight counts are integers from 0 through
  the edition-specific component limit.
- Improvement levels are integers from 0 through 5.
- Public victory points are the non-negative integer sum of that player's score
  ledger entries; no separate editable total is persisted.
- Standard mode starts at 3 public victory points and targets 13.
- Derived strengths are never persisted as independently editable values.

When an edit violates an invariant, the command fails without changing state.

## 11. World Events engine (v0.2.0)

World Events are original house-rule events that enrich the game. They are
entirely separate from the official Cities & Knights event die (barbarian /
progress cards) and from the balanced numbered-dice deck.

### 11.1 Catalog

The built-in catalog contains **20 typed events** distributed across five
category packs:

| User-facing pack     | Category ID | Events |
| -------------------- | ----------- | ------ |
| Weather & Harvest    | `nature`    | 4      |
| Trade & Markets      | `economy`   | 4      |
| Conflict & Defense   | `military`  | 4      |
| Diplomacy & Intrigue | `diplomacy` | 4      |
| Festivals & Progress | `society`   | 4      |

Each event carries metadata: `tone` (boon / mixed / setback), `impact` (1–3),
`category`, `scope` (all / active-player / conditional), `duration`, and
`compatibility` (including a two-player safety flag).

Distribution targets for a balanced experience:

- Tone: ~7 boon, ~6 mixed, ~7 setback
- Impact: ~8 × 1, ~8 × 2, ~4 × 3 (pyramid)

### 11.2 Separation from official systems

World Events never interact with the C&K event die or balanced dice decks.
They trigger on their own cadence schedule after all official resolution
(production, barbarian, progress) has completed.

### 11.3 Cadence (trigger frequency)

The setup UI exposes four options:

| Cadence  | Trigger bag             |
| -------- | ----------------------- |
| Off      | No world events         |
| Subtle   | 1 trigger and 17 blanks |
| Standard | 1 trigger and 11 blanks |
| Lively   | 1 trigger and 7 blanks  |

Standard is the default. The trigger bag is securely shuffled (Fisher-Yates
with `crypto.getRandomValues`) and drawn without replacement. At least two
completed turns separate events; conflicts with the cooldown are deferred.

### 11.4 Pack selection

Players select which packs to include during game setup (default: all five).
Events from unselected packs are excluded from the event deck. In two-player
mode, events without the `twoPlayer: true` compatibility flag are also
filtered.

### 11.5 Event selection deck

- Shuffle enabled event IDs into an event deck.
- Draw without replacement.
- Prevent the previous event from repeating across a deck boundary when at
  least two events are enabled.
- Store content by stable `EventId` and `contentVersion`.
- Saved history retains displayed title/instruction so later wording edits do
  not rewrite past games.

### 11.6 Event lifecycles (duration)

| Duration                | Behavior                                           |
| ----------------------- | -------------------------------------------------- |
| `immediate`             | Effect applies instantly; no tracking needed       |
| `rest-of-turn`          | Active until the triggering player's turn ends     |
| `full-round`            | Active for one full round after activation         |
| `until-next-occurrence` | Active until the next world event fires            |
| `until-resolved`        | Active until manually marked resolved by the table |

Non-immediate events are persisted as `ActiveWorldEventRecord` in the game
state and automatically expire or require explicit manual resolution.

### 11.7 Persistent UI and manual resolution

Active events are displayed persistently in the game UI. Events with
`until-resolved` duration show a "Mark resolved" button. The engine validates
that immediate events are never tracked and that full-round events maintain
consistent activation state.

### 11.8 Tone/impact balance

The shuffled ordering guardrails prevent tone and impact clumps
deterministically, including across deck-cycle boundaries.

### 11.9 Legacy v1 save compatibility

`ThematicEventDefinition` in v2+ saves includes full metadata. Legacy v1 saves
omit metadata fields (`tone`, `impact`, `category`, `scope`, `duration`,
`compatibility`) and remain loadable — the engine falls back to catalog lookups
for missing metadata. The `activeEvents` array is optional and absent in
legacy saves.

### 11.10 Test expectations

Engine integration tests cover:

- Round-boundary activation of full-round events
- Full-round expiry after their active round
- Rest-of-turn expiry after turn end
- `event.resolved` command for until-resolved events
- Legacy-save parsing (v1 definitions without metadata)
- Validation of active event invariants

### 11.11 Seasons Mode (v0.3.0)

Seasons Mode is an optional original house-rule layer over World Events. It is
unavailable when World Events are Off and never changes event cadence, the
numbered-production deck, or the official Cities & Knights event deck.

- The current season is derived from immutable setup plus the round number; no
  mutable season state is persisted.
- Seasons last 2, 3, or 4 complete rounds and advance only at a round boundary.
- The configured starting season may be Spring, Summer, Autumn, or Winter.
- At each World Event trigger, the active season weights the IDs still
  remaining in the current without-replacement cycle: favored `1.5`, neutral
  `1.0`, reduced `0.5`, with no category made impossible.
- Compatibility, immediate-repeat, tone-run, and impact-3 guardrails filter
  candidates before seasonal weighting.
- Active and deferred events retain their normal lifecycle across a season
  transition.
- The transition is included in the turn-boundary journal entry and announced
  accessibly during the first player's turn of the new season.
- Missing `seasonConfig` in older saves means Seasons Off.

## 12. Turn and victory rules

- Turns advance clockwise from the configured first player.
- The round increments after the last player completes a turn.
- Public-state edits are allowed during the action phase and are journaled.
- Ending the turn is blocked while required resolution remains.
- Reaching the target opens a winner confirmation; it does not silently end
  the game because hidden victory points may affect the table's result.

## 13. Undo semantics

Undo is domain-level reversal:

- Undoing a roll restores both deck cursors, track movement, trigger-bag state,
  and phase.
- Undoing an attack restores cities, score ledger, active knights, ship
  position, and robber activation.
- Undoing an end turn restores current player and round.
- Presentation effects such as sound or animation are never part of domain
  state.

An undo command is itself journaled. Import, archive, deletion, and irreversible
schema migration are not ordinary undo operations and require backups and
confirmation.

## 14. Error behavior

Domain errors use stable codes such as:

- `INVALID_PHASE`
- `INVALID_PLAYER_STATE`
- `NO_ACTIVE_GAME`
- `DECK_STATE_CORRUPT`
- `ATTACK_CONFIRMATION_STALE`
- `REVISION_CONFLICT`

No error handler may invent a roll, reset a deck, silently clamp a counter, or
continue with partially persisted state. The UI explains the error and offers
retry, restore previous revision, export diagnostics, or return home as
appropriate.
