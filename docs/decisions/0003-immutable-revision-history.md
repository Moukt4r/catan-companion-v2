# ADR 0003: Immutable full-state revision history

Status: accepted
Date: 2026-07-12

## Context

Rolls, attack resolutions, player-state edits, and turn transitions must be
durable and undoable as one unit. Reconstructing state from ad hoc mutable
records or partially reversible UI actions creates unacceptable risk.

Expected game documents are small, even with hundreds of turns.

## Decision

Persist every accepted command as an immutable revision containing:

- command metadata;
- human-readable summary;
- full plain-data game snapshot;
- parent revision and branch;
- application, rules, and schema versions;
- canonical state hash.

The game record points to an active head. Undo and redo move that head through
the revision graph. A new command after undo creates a branch and retains prior
history.

Revision creation and head update occur in one IndexedDB transaction.

## Consequences

### Positive

- Undo restores deck cursors and all side effects together.
- Recovery can select a previously verified snapshot.
- History is auditable and exportable.
- Domain replay and migration tests have stable fixtures.
- Implementation is easier to verify than inverse patches.

### Negative

- Storage is larger than a compact event log.
- Migrations may process many snapshots.
- Branch and navigation UX needs careful explanation.

Measured storage will be reviewed before adding compression. Correctness takes
priority over premature storage optimization.
