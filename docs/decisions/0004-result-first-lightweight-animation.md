# ADR 0004: Result-first lightweight animation

Status: accepted
Date: 2026-07-12

## Context

The earlier prototype coupled the experience to 3D dice and physics. Physics
adds bundle size, battery use, WebGL compatibility risk, difficult tests, and a
chance that visual orientation disagrees with the authoritative result.

The shared table still benefits from a polished roll moment.

## Decision

- Generate and persist the roll before any animation.
- Render original SVG dice and event symbols.
- Use CSS or Web Animations for a short deterministic presentation.
- Respect reduced motion and allow immediate results.
- Lazy-load optional original audio after opt-in.
- Do not ship a 3D or physics engine in v1.

A future WebGL enhancement may be considered only if it remains optional,
meets the bundle budget, has accessible fallback, and cannot alter results.

## Consequences

### Positive

- Smaller and faster application.
- Reliable on more phones and tablets.
- Straightforward reduced-motion and offline behavior.
- Visual and textual results cannot diverge.
- Easier automated testing.

### Negative

- Less visual spectacle than a full physics simulation.
- Custom SVG and motion design require original asset work.

For a game-night utility, speed, clarity, and correctness are more valuable
than simulated physics.
