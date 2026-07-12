# ADR 0001: Local-first static PWA

Status: accepted
Date: 2026-07-12

## Context

The game uses one shared device visible to all players. It does not need
accounts, remote players, cloud synchronization, or a server-side authority.
The target deployment is GitHub Pages, and the app must continue through an
entire game without connectivity.

## Decision

Build a client-only installable PWA:

- static Vite output hosted on GitHub Pages;
- IndexedDB as the authoritative game store;
- no runtime API dependency;
- no authentication, analytics, or cloud persistence;
- one active mutation controller coordinated across browser tabs;
- export/import for user-controlled backup.

Use one document URL and state-driven screens so history routing is unnecessary
on GitHub Pages.

## Consequences

### Positive

- Very low operational cost and deployment complexity.
- Games work offline and are not affected by server outages.
- No account or remote-data privacy burden.
- Fast local interactions.

### Negative

- Clearing browser storage can remove games without an export.
- Games do not automatically move between devices.
- Multi-tab conflicts must be handled locally.
- Support diagnostics cannot rely on server telemetry.

These limitations are acceptable for the first release and must be explained
in the product.
