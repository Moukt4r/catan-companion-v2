# Contributing

The repository is specification-first. A change is complete only when its
behavior, tests, accessibility, persistence impact, and release impact agree
with the documents in `docs/`.

## Working rules

1. Branch from `main`.
2. Keep domain rules independent of React and browser APIs.
3. Represent persisted state as plain, versioned data.
4. Add or update tests for every behavior change.
5. Treat balanced dice and thematic events as clearly labeled house rules.
6. Do not add official CATAN artwork, logos, card text, or copied rulebook
   content.
7. Use conventional commit subjects such as `feat:`, `fix:`, `test:`, and
   `docs:`.

## Required checks

Implementation pull requests will be expected to pass formatting, linting,
type checking, unit tests, property tests, component tests, a production
build, accessibility checks, and the critical Playwright smoke suite.

## Decision records

Add an architecture decision record under `docs/decisions/` when a change
alters a foundational constraint, persistence format, domain rule, platform
choice, or dependency strategy.
