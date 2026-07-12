# ADR 0002: Balanced roll decks

Status: accepted
Date: 2026-07-12

## Context

The desired experience intentionally removes long streaks from independent
dice. The numbered dice must cover all ordered outcomes, and the Cities &
Knights event die must preserve its face distribution over a short cycle.

This differs from official random dice and must remain transparent.

## Decision

- Numbered dice use a shuffled deck of all 36 ordered red/yellow pairs.
- Event die uses an independently shuffled deck containing three barbarian and
  one each science, trade, and politics face.
- Both use unbiased Fisher-Yates shuffling backed by Web Crypto.
- Deck order and cursor are persisted before use.
- Future outcomes are not shown.
- Alchemy selects numbered values without consuming the numbered deck; it still
  consumes the next event face.
- The UI consistently labels these systems as house rules.

## Consequences

### Positive

- Exact distribution is guaranteed in each cycle.
- Reload and undo behavior can be verified precisely.
- Test properties are strong and simple.
- Event-die composition cannot produce an extreme long-term imbalance.

### Negative

- Outcomes are not statistically equivalent to independent physical dice.
- Late-cycle outcomes become theoretically inferable.
- A repeated pair or total may still occur across cycle boundaries.
- The balanced event cycle changes barbarian timing relative to official
  independent rolls.

The app must explain these tradeoffs and must not market the behavior as
official randomness.
