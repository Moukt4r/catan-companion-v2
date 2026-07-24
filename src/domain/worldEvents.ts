/**
 * World Events domain module.
 *
 * Defines typed, balanced, lifecycle-aware "World Events" — thematic house-rule
 * events that enrich the Catan: Cities & Knights experience. These are entirely
 * separate from the official C&K event deck (barbarian / progress cards).
 *
 * Design invariants:
 * - Every WorldEventDefinition carries metadata sufficient for UI presentation
 *   and domain scheduling (tone, impact, category, scope, duration, compatibility).
 * - ThematicEventDefinition includes optional metadata so v2+ saves are
 *   self-describing; legacy v1 saves omit metadata and remain loadable.
 * - Balanced ordering guardrails prevent tone/impact clumps deterministically,
 *   including across deck-cycle boundaries.
 */

import type {
  ActiveWorldEventRecord,
  BoundedIntSource,
  EventId,
  RandomSource,
  ThematicEventDefinition,
  WorldEventCategory,
  WorldEventCompatibility,
  WorldEventDuration,
  WorldEventImpact,
  WorldEventScope,
  WorldEventTone,
} from "./types";
import { fisherYates } from "./random";

// Re-export metadata types from types.ts for convenience
export type {
  WorldEventTone,
  WorldEventImpact,
  WorldEventCategory,
  WorldEventScope,
  WorldEventDuration,
  WorldEventCompatibility,
} from "./types";

// ---------------------------------------------------------------------------
// WorldEventDefinition — the enriched build-time catalog type
// ---------------------------------------------------------------------------

export interface WorldEventDefinition {
  id: EventId;
  contentVersion: number;
  title: string;
  instruction: string;
  tone: WorldEventTone;
  impact: WorldEventImpact;
  category: WorldEventCategory;
  scope: WorldEventScope;
  duration: WorldEventDuration;
  compatibility: WorldEventCompatibility;
}

// ---------------------------------------------------------------------------
// Projection to persistence shape
// ---------------------------------------------------------------------------

/**
 * Project a WorldEventDefinition to the persistence-compatible
 * ThematicEventDefinition, including full metadata so persisted catalogs
 * are self-describing and independent of the built-in catalog version.
 */
export function toThematicDefinition(
  event: WorldEventDefinition,
): ThematicEventDefinition {
  return {
    id: event.id,
    contentVersion: event.contentVersion,
    title: event.title,
    instruction: event.instruction,
    tone: event.tone,
    impact: event.impact,
    category: event.category,
    scope: event.scope,
    duration: event.duration,
    compatibility: { ...event.compatibility },
  };
}

/**
 * Look up a WorldEventDefinition by id.
 * Returns undefined for ids not in the catalog (legacy / custom events).
 */
export function lookupWorldEvent(
  catalog: readonly WorldEventDefinition[],
  id: EventId,
): WorldEventDefinition | undefined {
  return catalog.find((event) => event.id === id);
}

// ---------------------------------------------------------------------------
// Built-in catalog — 20 coherent, balanced events
// ---------------------------------------------------------------------------

function worldEvent(
  id: string,
  title: string,
  instruction: string,
  tone: WorldEventTone,
  impact: WorldEventImpact,
  category: WorldEventCategory,
  scope: WorldEventScope,
  duration: WorldEventDuration,
  compatibility: WorldEventCompatibility = { twoPlayer: true },
  contentVersion = 1,
): WorldEventDefinition {
  return {
    id: id as EventId,
    contentVersion,
    title,
    instruction,
    tone,
    impact,
    category,
    scope,
    duration,
    compatibility,
  };
}

/**
 * The canonical World Events catalog.
 *
 * Distribution targets:
 *   Tone:     ~7 boon, ~6 mixed, ~7 setback  (balanced)
 *   Impact:   ~8 × 1, ~8 × 2, ~4 × 3         (pyramid)
 *   Category: 4 each for economy/military/nature/society, 4 diplomacy
 *   Duration: mix of all five, majority immediate/rest-of-turn
 */
export const WORLD_EVENTS_CATALOG: readonly WorldEventDefinition[] = [
  // ── Economy ────────────────────────────────────────────────────────────
  worldEvent(
    "we-good-harvest",
    "Good Harvest",
    "Each player chooses one resource type and takes one of that resource from the bank.",
    "boon",
    1,
    "economy",
    "all",
    "immediate",
  ),
  worldEvent(
    "we-market-day",
    "Market Day",
    "The active player may make one 2:1 trade with the bank this turn (any resource type).",
    "boon",
    2,
    "economy",
    "active-player",
    "rest-of-turn",
    { twoPlayer: true, requires: ["maritime-trade"] },
  ),
  worldEvent(
    "we-trade-winds",
    "Trade Winds",
    "During its active round, all maritime trade ratios are reduced by 1 (minimum 2:1).",
    "boon",
    2,
    "economy",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["maritime-trade"] },
  ),
  worldEvent(
    "we-tax-collection",
    "Tax Collection",
    "Each player with 7 or more victory points must return one resource of their choice to the bank.",
    "setback",
    1,
    "economy",
    "conditional",
    "immediate",
  ),

  // ── Military ───────────────────────────────────────────────────────────
  worldEvent(
    "we-border-patrol",
    "Border Patrol",
    "Each player with at least one active knight receives one free resource of their choice.",
    "boon",
    1,
    "military",
    "conditional",
    "immediate",
    { twoPlayer: true, requires: ["knights"] },
  ),
  worldEvent(
    "we-raider-attack",
    "Raider Attack",
    "Each player with a settlement or city on a hex numbered 6 or 8 must discard one resource.",
    "setback",
    2,
    "military",
    "conditional",
    "immediate",
  ),
  worldEvent(
    "we-peace-treaty",
    "Peace Treaty",
    "During its active round, the robber cannot be moved. If the robber is on a hex, it remains there but does not block production.",
    "mixed",
    2,
    "military",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["robber"] },
  ),
  worldEvent(
    "we-fortification",
    "Fortification",
    "During its active round, each player may activate one knight without paying grain.",
    "boon",
    1,
    "military",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["knights"] },
  ),

  // ── Diplomacy ──────────────────────────────────────────────────────────
  worldEvent(
    "we-trade-embargo",
    "Trade Embargo",
    "No domestic trades between players are allowed during its active round.",
    "setback",
    2,
    "diplomacy",
    "all",
    "full-round",
    { twoPlayer: false },
  ),
  worldEvent(
    "we-cooperation",
    "Cooperation",
    "During its active round, each player may once receive one resource from another player without giving a resource back. The other player must agree.",
    "boon",
    2,
    "diplomacy",
    "all",
    "full-round",
    { twoPlayer: false },
  ),
  worldEvent(
    "we-diplomacy",
    "Diplomatic Summit",
    "During its active round, no progress cards may be played that target another player.",
    "mixed",
    2,
    "diplomacy",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["progress-cards"] },
  ),
  worldEvent(
    "we-envoy",
    "Royal Envoy",
    "The player with the fewest victory points chooses one resource from the bank. (Tied? Each tied player chooses one.)",
    "mixed",
    1,
    "diplomacy",
    "conditional",
    "immediate",
  ),

  // ── Nature ─────────────────────────────────────────────────────────────
  worldEvent(
    "we-earthquake",
    "Earthquake",
    "Each player chooses one of their road segments and flips it face-down (it no longer counts for Longest Road or connectivity). The damaged road may be repaired by paying 1 brick + 1 lumber on a future turn. If a player has no roads, they are unaffected.",
    "setback",
    2,
    "nature",
    "all",
    "until-resolved",
  ),
  worldEvent(
    "we-drought",
    "Drought",
    "Fields (grain hexes) produce nothing during its active round.",
    "setback",
    2,
    "nature",
    "all",
    "full-round",
  ),
  worldEvent(
    "we-storm",
    "Storm at Sea",
    "No maritime trade is allowed during its active round.",
    "setback",
    1,
    "nature",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["maritime-trade"] },
  ),
  worldEvent(
    "we-abundant-year",
    "Abundant Year",
    "During its active round, every producing hex grants one additional resource to each player with a city on it.",
    "boon",
    3,
    "nature",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["cities"] },
  ),

  // ── Society ────────────────────────────────────────────────────────────
  worldEvent(
    "we-festival",
    "Festival",
    "Each player with at least one city receives one resource matching any hex adjacent to one of their cities.",
    "boon",
    1,
    "society",
    "conditional",
    "immediate",
    { twoPlayer: true, requires: ["cities"] },
  ),
  worldEvent(
    "we-epidemic",
    "Epidemic",
    "During its active round, cities produce resources as if they were settlements (1 resource instead of 2).",
    "setback",
    3,
    "society",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["cities"] },
  ),
  worldEvent(
    "we-innovation",
    "Innovation",
    "During its active round, each player’s first city-improvement upgrade costs one fewer commodity (minimum one).",
    "mixed",
    2,
    "society",
    "all",
    "full-round",
    { twoPlayer: true, requires: ["improvements"] },
  ),
  worldEvent(
    "we-celebration",
    "Celebration",
    "Each player may draw one progress card at no cost if they have at least one improvement at level 3 or higher.",
    "mixed",
    1,
    "society",
    "conditional",
    "immediate",
    { twoPlayer: true, requires: ["improvements", "progress-cards"] },
  ),
];

// ---------------------------------------------------------------------------
// Balanced deck ordering
// ---------------------------------------------------------------------------

/** Maximum consecutive events allowed with the same tone. */
const MAX_CONSECUTIVE_SAME_TONE = 2;

/** Maximum consecutive high-impact (3) events. */
const MAX_CONSECUTIVE_HIGH_IMPACT = 1;

/**
 * Create a balanced World Events deck order.
 *
 * Algorithm:
 * 1. Fisher-Yates shuffle for randomness.
 * 2. Greedy insertion: build the output sequence one element at a time,
 *    always picking the first shuffled element that doesn't violate
 *    tone-run or impact-run constraints.
 * 3. Post-repair: fix any remaining violations from greedy fallback.
 * 4. Anti-repeat + impact-3 anti-clump across deck-cycle boundary.
 *
 * Deterministic given the same RNG seed.
 */
export function createBalancedWorldEventOrder(
  events: readonly WorldEventDefinition[],
  random: RandomSource | BoundedIntSource,
  previousEventId: EventId | null,
): EventId[] {
  if (events.length <= 1) {
    return events.map((e) => e.id);
  }

  const shuffled = fisherYates([...events], random);
  const metaById = new Map(events.map((e) => [e.id, e]));

  const result: WorldEventDefinition[] = [];
  const remaining = [...shuffled];

  while (remaining.length > 0) {
    let placed = false;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      if (isValidPlacement(result, candidate)) {
        result.push(candidate);
        remaining.splice(i, 1);
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Graceful degradation: accept the first one anyway
      result.push(remaining.shift()!);
    }
  }

  const order = result.map((e) => e.id);

  // Post-repair: fix any remaining violations from greedy fallback
  repairViolations(order, metaById);

  // Anti-repeat and impact-3 anti-clump across deck-cycle boundary
  if (previousEventId !== null && order.length > 1) {
    const prevMeta = metaById.get(previousEventId);

    // Same-event anti-repeat
    if (order[0] === previousEventId) {
      const replacement = order.findIndex((id) => id !== previousEventId);
      if (replacement > 0) {
        swap(order, 0, replacement);
      }
    }

    // Impact-3 anti-clump across deck-cycle boundary
    if (prevMeta && prevMeta.impact === 3) {
      const firstMeta = metaById.get(order[0]!);
      if (firstMeta && firstMeta.impact === 3) {
        const safeIdx = order.findIndex((id) => {
          const m = metaById.get(id);
          return m && m.impact !== 3 && id !== previousEventId;
        });
        if (safeIdx > 0) {
          swap(order, 0, safeIdx);
        }
      }
    }
  }

  return order;
}

function isValidPlacement(
  placed: readonly WorldEventDefinition[],
  candidate: WorldEventDefinition,
): boolean {
  const len = placed.length;

  // Tone constraint: no 3+ consecutive same tone
  if (len >= MAX_CONSECUTIVE_SAME_TONE) {
    const allSameTone = Array.from(
      { length: MAX_CONSECUTIVE_SAME_TONE },
      (_, k) => placed[len - 1 - k]!.tone,
    ).every((t) => t === candidate.tone);
    if (allSameTone) return false;
  }

  // Impact constraint: no 2+ consecutive impact-3
  if (candidate.impact === 3 && len >= MAX_CONSECUTIVE_HIGH_IMPACT) {
    const allHighImpact = Array.from(
      { length: MAX_CONSECUTIVE_HIGH_IMPACT },
      (_, k) => placed[len - 1 - k]!.impact,
    ).every((imp) => imp === 3);
    if (allHighImpact) return false;
  }

  return true;
}

function repairViolations(
  order: EventId[],
  metaById: Map<EventId, WorldEventDefinition>,
): void {
  for (let pass = 0; pass < order.length * 2; pass++) {
    let foundViolation = false;
    for (let i = 0; i < order.length; i++) {
      const current = metaById.get(order[i]!)!;
      let violated = false;

      if (i >= MAX_CONSECUTIVE_SAME_TONE) {
        violated = Array.from(
          { length: MAX_CONSECUTIVE_SAME_TONE },
          (_, k) => metaById.get(order[i - k - 1]!)!.tone,
        ).every((t) => t === current.tone);
      }

      if (
        !violated &&
        current.impact === 3 &&
        i >= MAX_CONSECUTIVE_HIGH_IMPACT
      ) {
        violated = Array.from(
          { length: MAX_CONSECUTIVE_HIGH_IMPACT },
          (_, k) => metaById.get(order[i - k - 1]!)!.impact,
        ).every((imp) => imp === 3);
      }

      if (violated) {
        for (let j = 0; j < order.length; j++) {
          if (j === i) continue;
          const tmp = order[i]!;
          order[i] = order[j]!;
          order[j] = tmp;
          if (
            !hasLocalViolation(order, i, metaById) &&
            !hasLocalViolation(order, j, metaById)
          ) {
            foundViolation = true;
            break;
          }
          order[j] = order[i]!;
          order[i] = tmp;
        }
      }
    }
    if (!foundViolation) break;
  }
}

function hasLocalViolation(
  order: EventId[],
  idx: number,
  metaById: Map<EventId, WorldEventDefinition>,
): boolean {
  const current = metaById.get(order[idx]!)!;

  if (idx >= MAX_CONSECUTIVE_SAME_TONE) {
    const allSame = Array.from(
      { length: MAX_CONSECUTIVE_SAME_TONE },
      (_, k) => metaById.get(order[idx - k - 1]!)!.tone,
    ).every((t) => t === current.tone);
    if (allSame) return true;
  }
  if (idx + 1 < order.length && idx >= 1) {
    const after = metaById.get(order[idx + 1]!)!;
    const before = metaById.get(order[idx - 1]!)!;
    if (before.tone === current.tone && after.tone === current.tone)
      return true;
  }
  if (idx + MAX_CONSECUTIVE_SAME_TONE < order.length) {
    const afterAll = Array.from(
      { length: MAX_CONSECUTIVE_SAME_TONE },
      (_, k) => metaById.get(order[idx + k + 1]!)!.tone,
    ).every((t) => t === current.tone);
    if (afterAll) return true;
  }

  if (current.impact === 3) {
    if (idx > 0 && metaById.get(order[idx - 1]!)!.impact === 3) return true;
    if (idx + 1 < order.length && metaById.get(order[idx + 1]!)!.impact === 3)
      return true;
  }

  return false;
}

function swap<T>(arr: T[], i: number, j: number): void {
  const tmp = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = tmp;
}

// ---------------------------------------------------------------------------
// Active event lifecycle
// ---------------------------------------------------------------------------

/**
 * Runtime representation of an active (in-effect) world event.
 * Structurally identical to ActiveWorldEventRecord but uses strict union types.
 * Full-round events are "deferred" when triggered mid-round and activate
 * at the next round boundary. Other durations activate immediately.
 */
export type ActiveWorldEvent = ActiveWorldEventRecord;

/**
 * Determine whether an active event has expired given the current game state.
 */
export function isWorldEventExpired(
  event: ActiveWorldEvent,
  currentCompletedTurns: number,
  currentRound: number,
  playerCount: number,
): boolean {
  void playerCount;
  switch (event.duration) {
    case "immediate":
      return true;

    case "rest-of-turn":
      return currentCompletedTurns > event.triggeredAtCompletedTurn;

    case "full-round":
      if (event.activeRound === null) {
        return false;
      }
      return currentRound > event.activeRound;

    case "until-next-occurrence":
      return false;

    case "until-resolved":
      return false;
  }
}

/**
 * Activate deferred full-round events at a round boundary.
 */
export function activateDeferredEvents(
  activeEvents: readonly ActiveWorldEvent[],
  newRound: number,
): ActiveWorldEvent[] {
  return activeEvents.map((event) => {
    if (event.duration === "full-round" && !event.activated) {
      return { ...event, activated: true, activeRound: newRound };
    }
    return event;
  });
}

/**
 * Remove expired events and "until-next-occurrence" events when a new event fires.
 */
export function pruneActiveEvents(
  activeEvents: readonly ActiveWorldEvent[],
  currentCompletedTurns: number,
  currentRound: number,
  playerCount: number,
  newEventFiring: boolean,
): ActiveWorldEvent[] {
  return activeEvents.filter((event) => {
    if (
      isWorldEventExpired(
        event,
        currentCompletedTurns,
        currentRound,
        playerCount,
      )
    ) {
      return false;
    }
    if (newEventFiring && event.duration === "until-next-occurrence") {
      return false;
    }
    return true;
  });
}

/**
 * Create an ActiveWorldEvent from a triggered WorldEventDefinition.
 * Immediate-duration events return null (they don't need lifecycle tracking).
 */
export function createActiveWorldEvent(
  occurrenceId: string,
  event: WorldEventDefinition,
  triggeredAtCompletedTurn: number,
  currentRound: number,
): ActiveWorldEvent | null {
  void currentRound;
  if (event.duration === "immediate") {
    return null;
  }

  const isFullRound = event.duration === "full-round";

  return {
    occurrenceId,
    eventId: event.id,
    contentVersion: event.contentVersion,
    title: event.title,
    instruction: event.instruction,
    tone: event.tone,
    impact: event.impact,
    category: event.category,
    scope: event.scope,
    duration: event.duration,
    compatibility: { ...event.compatibility },
    activeRound: null, // full-round events get activeRound set at activation
    triggeredAtCompletedTurn,
    activated: !isFullRound,
  };
}

/**
 * Create an ActiveWorldEvent from a ThematicEventDefinition with optional metadata.
 * Falls back to catalog lookup; returns null if no metadata available or immediate.
 */
export function createActiveWorldEventFromDefinition(
  occurrenceId: string,
  definition: ThematicEventDefinition,
  catalog: readonly WorldEventDefinition[],
  triggeredAtCompletedTurn: number,
  currentRound: number,
): ActiveWorldEvent | null {
  // Prefer metadata on the definition itself (v2+)
  if (definition.tone && definition.duration) {
    const syntheticDef: WorldEventDefinition = {
      id: definition.id,
      contentVersion: definition.contentVersion,
      title: definition.title,
      instruction: definition.instruction,
      tone: definition.tone,
      impact: definition.impact ?? 1,
      category: definition.category ?? "society",
      scope: definition.scope ?? "all",
      duration: definition.duration,
      compatibility: definition.compatibility ?? { twoPlayer: true },
    };
    return createActiveWorldEvent(
      occurrenceId,
      syntheticDef,
      triggeredAtCompletedTurn,
      currentRound,
    );
  }

  // Fall back to catalog lookup
  const worldDef = lookupWorldEvent(catalog, definition.id);
  if (worldDef) {
    return createActiveWorldEvent(
      occurrenceId,
      worldDef,
      triggeredAtCompletedTurn,
      currentRound,
    );
  }

  // Legacy text-only event — no lifecycle tracking possible
  return null;
}

// ---------------------------------------------------------------------------
// Resolve an until-resolved event
// ---------------------------------------------------------------------------

/**
 * Remove a specific until-resolved event from the active list.
 * Returns null if the occurrenceId was not found or the event is not until-resolved.
 */
export function resolveActiveEvent(
  activeEvents: readonly ActiveWorldEvent[],
  occurrenceId: string,
): { resolved: ActiveWorldEvent; remaining: ActiveWorldEvent[] } | null {
  const idx = activeEvents.findIndex((e) => e.occurrenceId === occurrenceId);
  if (idx < 0) return null;
  const event = activeEvents[idx]!;
  if (event.duration !== "until-resolved") return null;
  const remaining = [...activeEvents];
  remaining.splice(idx, 1);
  return { resolved: event, remaining };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TONES: readonly string[] = ["boon", "mixed", "setback"];
const VALID_CATEGORIES: readonly string[] = [
  "economy",
  "military",
  "diplomacy",
  "nature",
  "society",
];
const VALID_SCOPES: readonly string[] = ["all", "active-player", "conditional"];
const VALID_DURATIONS: readonly string[] = [
  "immediate",
  "rest-of-turn",
  "full-round",
  "until-next-occurrence",
  "until-resolved",
];

/**
 * Validate an array of active world event records.
 * Returns a list of error messages (empty = valid).
 */
export function validateActiveEvents(
  activeEvents: readonly ActiveWorldEventRecord[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const event of activeEvents) {
    if (seen.has(event.occurrenceId)) {
      errors.push(`Duplicate active event occurrenceId: ${event.occurrenceId}`);
    }
    seen.add(event.occurrenceId);

    if (!VALID_TONES.includes(event.tone)) {
      errors.push(
        `Active event ${event.occurrenceId}: invalid tone "${event.tone}"`,
      );
    }
    if (![1, 2, 3].includes(event.impact)) {
      errors.push(
        `Active event ${event.occurrenceId}: invalid impact ${event.impact}`,
      );
    }
    if (!VALID_CATEGORIES.includes(event.category)) {
      errors.push(
        `Active event ${event.occurrenceId}: invalid category "${event.category}"`,
      );
    }
    if (!VALID_SCOPES.includes(event.scope)) {
      errors.push(
        `Active event ${event.occurrenceId}: invalid scope "${event.scope}"`,
      );
    }
    if (!VALID_DURATIONS.includes(event.duration)) {
      errors.push(
        `Active event ${event.occurrenceId}: invalid duration "${event.duration}"`,
      );
    }
    if (event.duration === "immediate") {
      errors.push(
        `Active event ${event.occurrenceId}: immediate events should not be tracked`,
      );
    }
    if (!event.title || event.title.trim().length === 0) {
      errors.push(`Active event ${event.occurrenceId}: missing title`);
    }
    if (!event.instruction || event.instruction.trim().length === 0) {
      errors.push(`Active event ${event.occurrenceId}: missing instruction`);
    }
    if (event.contentVersion < 1) {
      errors.push(
        `Active event ${event.occurrenceId}: contentVersion must be >= 1`,
      );
    }
    if (
      event.duration === "full-round" &&
      event.activated &&
      event.activeRound === null
    ) {
      errors.push(
        `Active event ${event.occurrenceId}: activated full-round event must have activeRound`,
      );
    }
    if (
      event.duration === "full-round" &&
      !event.activated &&
      event.activeRound !== null
    ) {
      errors.push(
        `Active event ${event.occurrenceId}: deferred full-round event must not have activeRound`,
      );
    }
  }

  return errors;
}
