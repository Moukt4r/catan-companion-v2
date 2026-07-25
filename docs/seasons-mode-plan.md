# Seasons Mode — Implemented Design

> **Status:** Implemented in application v0.3.0 on 2026-07-24.
>
> This is the canonical design and verification contract for an original
> four-season house-rule layer over World Events. It does not reproduce CATAN:
> The Seasons, official event-card mechanics, or published card text.

## 1. Recommendation

Build Seasons as a **lightweight bias and presentation layer over World
Events**, not as another event engine.

- Seasons change only at round boundaries.
- Existing World Event packs, cadence, balance rules, lifecycle, history, and
  active-event UI remain authoritative.
- A season influences which eligible event is drawn next; it never creates a
  second event or alters the official Cities & Knights event deck.
- The season is derived from the round number and saved setup configuration,
  avoiding mutable state that could drift.

This is small enough to be understandable at the table and large enough to
make games feel different.

## 2. Product goals

- Add a visible story arc to longer games without adding bookkeeping.
- Make the five World Event packs feel more varied across a game.
- Preserve fairness: every player experiences the same season for a full round.
- Reuse the existing typed World Event and persistence architecture.
- Keep the mode optional and explicitly labeled as a house rule.

## 3. Non-goals

- Replacing production dice or the official C&K event die.
- Creating automatic resource accounting.
- Locking players into season-specific packs.
- Adding a second active-effect lifecycle.
- Copying names, rules, card text, visual identity, or sequencing from any
  published CATAN product or fan expansion.

## 4. Cadence

Recommended season lengths:

| Setting  | Rounds per season | Full cycle |
| -------- | ----------------- | ---------- |
| Short    | 2                 | 8 rounds   |
| Standard | 3                 | 12 rounds  |
| Long     | 4                 | 16 rounds  |

A typical game should reach several seasons. After Winter, the cycle returns to
Spring.

Transitions happen **only when a new round begins**. The first player of the new
round sees the transition before rolling. No season changes mid-round.

## 5. Seasonal identity

Seasonal identity comes from category weighting, restrained table copy, and a
small visual indicator.

| Season | Favored packs                            | Reduced pack         |
| ------ | ---------------------------------------- | -------------------- |
| Spring | Weather & Harvest, Diplomacy & Intrigue  | Conflict & Defense   |
| Summer | Trade & Markets, Conflict & Defense      | Weather & Harvest    |
| Autumn | Weather & Harvest, Festivals & Progress  | Diplomacy & Intrigue |
| Winter | Conflict & Defense, Diplomacy & Intrigue | Trade & Markets      |

Suggested weights:

- favored category: `1.5`
- neutral category: `1.0`
- reduced category: `0.5`
- hard minimum: `0.25`

No selected pack is ever eliminated. If only one pack is enabled, Seasons does
not alter event selection.

## 6. Event selection

The existing event deck remains a without-replacement cycle. For each World
Event trigger:

1. Start with the IDs remaining in the current cycle.
2. Apply the active season's category weights.
3. Exclude candidates that would violate immediate-repeat, tone-run, or
   impact-3 guardrails when another valid candidate exists.
4. Perform a deterministic weighted draw with the injected random source.
5. Remove the selected ID from the remaining cycle.

This preserves catalog coverage while making seasonally appropriate events more
likely to appear earlier in each cycle. It also avoids duplicating IDs merely to
simulate weight.

## 7. Data model

Persist configuration, derive current season:

```ts
interface SeasonConfig {
  enabled: boolean;
  roundsPerSeason: 2 | 3 | 4;
  startingSeason: "spring" | "summer" | "autumn" | "winter";
}
```

`SeasonConfig` belongs in `GameSetup`. The current season is a pure selector:

```ts
deriveSeason(setup.seasonConfig, turn.round);
```

No separate mutable `SeasonState` is required. A transition is detected when a
turn-ending decision advances the round and the derived season changes.

### Legacy saves

- Missing `seasonConfig` means `{ enabled: false }`.
- Existing games remain unchanged.
- Enabling Seasons mid-game is out of scope for the first release; this avoids
  rewriting an immutable setup and revision history.

## 8. Interaction with World Event lifecycle

- Active events survive a season change and expire according to their own
  duration.
- Deferred full-round events activate normally at the next round boundary,
  even if that boundary also changes the season.
- Season transition announcement is presented before any newly activated World
  Event reminder, then the normal turn begins.
- The active-events strip remains unchanged.

## 9. UI

### Setup

Below World Event packs:

- `Enable Seasons (house rule)`
- Short / Standard / Long
- Starting season, default Spring
- Plain-language preview: `Spring changes every 3 rounds; all selected packs
remain possible.`

Seasons must be unavailable when World Events are Off.

### Game table

- Compact icon plus text: `Spring · round 2 of 3`
- Never rely on color alone.
- Subtle background accent only; no animated weather effects.
- Season transition uses a polite live announcement and remains visible until
  the first player begins the round.

### History and export

- Journal season transitions so undo/redo remains understandable.
- Include the active season in exported diagnostics and game summaries.

## 10. Balance constraints

- Existing tone and impact anti-clump rules always outrank seasonal preference.
- Seasonal weighting never makes an event impossible.
- Two-player and prerequisite compatibility filtering happens before weighting.
- A season cannot change event cadence.
- No season grants a direct passive production modifier; all mechanical effects
  still come from explicit World Events.
- Simulations should measure category distribution, tone runs, impact runs,
  event starvation, and how many seasons typical games experience.

## 11. Accessibility

- Use text and icon together for the current season.
- Announce transitions through `aria-live="polite"`.
- High-contrast mode uses borders/patterns, not color alone.
- Reduced-motion mode disables transition animation.
- Season names and controls remain ordinary localized text, not decorative
  glyph-only buttons.

## 11.1 Implementation record

The v0.3.0 implementation includes phases 1–4 plus deterministic distribution
coverage from phase 5. Selection is evaluated at each trigger against the IDs
remaining in the persisted deck cycle, so a season transition affects the next
event immediately. Unit, persistence, component, accessibility, and multi-browser
E2E gates form the release contract.

## 12. Delivery phases

| Phase | Scope                                                                        |
| ----- | ---------------------------------------------------------------------------- |
| 1     | Optional setup configuration, schema compatibility, and pure season selector |
| 2     | Round-boundary transition decision, journal entry, undo/redo tests           |
| 3     | Weighted-without-replacement World Event selection with property tests       |
| 4     | Setup UI, table indicator, transition announcement, import/export and E2E    |
| 5     | Simulation-based tuning and copy polish                                      |

**MVP recommendation:** phases 1–4 are the release gate. Phase 5 is tuning, not a
reason to ship without persistence, accessibility, or E2E coverage.

## 13. Test plan

- Unit: exact transitions for 2/3/4-round seasons and all starting seasons.
- Property: every season reachable; selected events remain unique per deck
  cycle; no category becomes impossible; tone/impact constraints always hold.
- Integration: round change, deferred full-round event activation, journal,
  undo, and redo at the same boundary.
- Persistence: old saves default Off; new setup/export/import round-trips.
- E2E: setup dependency on World Events, season indicator, transition
  announcement, high-contrast, reduced-motion, and mobile layout.

## 14. Main risks

| Risk                         | Mitigation                                               |
| ---------------------------- | -------------------------------------------------------- |
| Seasonal bias feels cosmetic | Strong but bounded `1.5 / 1.0 / 0.5` weights             |
| A selected pack feels absent | Minimum weight and without-replacement cycle             |
| Event balance degrades       | Tone/impact constraints outrank season preference        |
| Too much UI noise            | One compact indicator and one boundary announcement      |
| IP confusion                 | Original mechanics/copy and explicit house-rule labeling |
| Legacy save failure          | Optional setup field with backward-compatibility tests   |

---

Cross-references:

- [Rules and domain — World Events](rules-and-domain.md#11-world-events-engine-v020)
- [Product specification — FR-09](product-spec.md#fr-09-world-events-v020)
- [Implementation plan](implementation-plan.md)
