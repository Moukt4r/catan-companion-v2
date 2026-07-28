import type { GameState, IsoTimestamp, PlayerId } from "../../domain";
import { createGameClock } from "../../domain/clock";
import type {
  PersistedCommand,
  StoredRevision,
} from "../../application/persistence";
import { sha256 } from "../../application/integrity";

/**
 * Removes board-owned bookkeeping from saves written before the app stopped
 * tracking it.
 *
 * Cities, city walls and knights used to be mirrored in the app. The physical
 * board is authoritative for all of them, so they were dropped. The
 * persistence schema is strict, which means it rejects *unknown* keys just as
 * hard as it rejects missing ones: an old save still carrying `cityWalls`
 * would fail to parse and be written back as `corrupt`. Stripping the removed
 * fields here is what keeps existing games loadable.
 *
 * Migration never invents data. It only deletes fields the app no longer owns
 * and folds the old attack bookkeeping into the single fact the app still
 * records: that an attack happened.
 */

const REMOVED_PLAYER_FIELDS = [
  "ordinaryCities",
  "activeKnights",
  "inactiveKnights",
  "cityWalls",
] as const;

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function stripKeys(
  source: Record<string, unknown>,
  keys: readonly string[],
): { value: Record<string, unknown>; changed: boolean } {
  const present = keys.filter((key) => key in source);
  if (present.length === 0) {
    return { value: source, changed: false };
  }
  const value = { ...source };
  for (const key of present) {
    delete value[key];
  }
  return { value, changed: true };
}

function migratePlayers(players: unknown): {
  players: unknown;
  changed: boolean;
} {
  if (!isUnknownArray(players)) {
    return { players, changed: false };
  }
  let changed = false;
  const migrated: unknown[] = players.map((player) => {
    if (typeof player !== "object" || player === null) {
      return player;
    }
    const result = stripKeys(
      player as Record<string, unknown>,
      REMOVED_PLAYER_FIELDS,
    );
    changed ||= result.changed;
    return result.value;
  });
  return changed ? { players: migrated, changed: true } : { players, changed };
}

/**
 * Folds a legacy barbarian block into the current shape.
 *
 * A save paused mid-attack still carries `pendingAttack`. Those attacks were
 * always settled on the table, so the migration completes them exactly the way
 * the app does now: log that it happened, reset the ship, arm the robber.
 */
function migrateBarbarian(barbarian: unknown): {
  barbarian: unknown;
  attackAbsorbed: boolean;
  changed: boolean;
} {
  if (typeof barbarian !== "object" || barbarian === null) {
    return { barbarian, attackAbsorbed: false, changed: false };
  }
  const source = barbarian as Record<string, unknown>;
  const next = { ...source };
  let changed = false;

  const rules = source.rules;
  if (typeof rules === "object" && rules !== null) {
    const strippedRules = stripKeys(rules as Record<string, unknown>, [
      "knightComponentLimitPerLevel",
    ]);
    if (strippedRules.changed) {
      next.rules = strippedRules.value;
      changed = true;
    }
  }

  // Attack history keeps only the identity and the timestamp.
  const rawHistory = source.history;
  if (isUnknownArray(rawHistory)) {
    let historyChanged = false;
    const history: unknown[] = rawHistory.map((record) => {
      if (typeof record !== "object" || record === null) {
        return record;
      }
      const result = stripKeys(record as Record<string, unknown>, [
        "strengths",
        "outcome",
        "progressChoices",
      ]);
      historyChanged ||= result.changed;
      return result.value;
    });
    if (historyChanged) {
      next.history = history;
      changed = true;
    }
  }

  let attackAbsorbed = false;
  if ("pendingAttack" in source) {
    const pending = source.pendingAttack;
    delete next.pendingAttack;
    changed = true;
    if (typeof pending === "object" && pending !== null) {
      const proposalId = (pending as Record<string, unknown>).id;
      const history: unknown[] = isUnknownArray(next.history)
        ? [...next.history]
        : [];
      history.push({
        proposalId: typeof proposalId === "string" ? proposalId : "legacy",
        completedAt:
          typeof source.completedAt === "string"
            ? source.completedAt
            : new Date(0).toISOString(),
      });
      next.history = history;
      next.shipPosition = 0;
      next.robberActivated = true;
      next.attacksCompleted =
        (typeof source.attacksCompleted === "number"
          ? source.attacksCompleted
          : 0) + 1;
      attackAbsorbed = true;
    }
  }

  return changed
    ? { barbarian: next, attackAbsorbed, changed: true }
    : { barbarian, attackAbsorbed: false, changed: false };
}

function migrateStatistics(statistics: unknown): {
  statistics: unknown;
  changed: boolean;
} {
  if (typeof statistics !== "object" || statistics === null) {
    return { statistics, changed: false };
  }
  const source = statistics as Record<string, unknown>;
  const hasWon = "barbarianAttacksWon" in source;
  const hasLost = "barbarianAttacksLost" in source;
  if (!hasWon && !hasLost) {
    return { statistics, changed: false };
  }
  const won =
    typeof source.barbarianAttacksWon === "number"
      ? source.barbarianAttacksWon
      : 0;
  const lost =
    typeof source.barbarianAttacksLost === "number"
      ? source.barbarianAttacksLost
      : 0;
  const next: Record<string, unknown> = { ...source };
  delete next.barbarianAttacksWon;
  delete next.barbarianAttacksLost;
  next.barbarianAttacks = won + lost;
  return { statistics: next, changed: true };
}

export function migrateGameState(state: GameState): {
  state: GameState;
  changed: boolean;
} {
  const source = state as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  let changed = false;

  const players = migratePlayers(source.players);
  if (players.changed) {
    next.players = players.players;
    changed = true;
  }

  // Setup carries its own player list with the same removed fields.
  const setup = source.setup;
  if (typeof setup === "object" && setup !== null) {
    const setupSource = setup as Record<string, unknown>;
    const setupPlayers = migratePlayers(setupSource.players);
    if (setupPlayers.changed) {
      next.setup = { ...setupSource, players: setupPlayers.players };
      changed = true;
    }
  }

  const barbarian = migrateBarbarian(source.barbarian);
  if (barbarian.changed) {
    next.barbarian = barbarian.barbarian;
    changed = true;
  }

  const statistics = migrateStatistics(source.statistics);
  if (statistics.changed) {
    next.statistics = statistics.statistics;
    changed = true;
  }

  // Saves written before timing support carry no clock at all. The schema is
  // strict and requires one, so such a save would fail to parse and be written
  // back as `corrupt` — losing the game. The documented promise is that a
  // legacy game initializes its clock when first resumed, and this is where
  // that happens: the only place a save is repaired before validation.
  //
  // Time starts now rather than at the game's creation, because the elapsed
  // time was never recorded and inventing it would be worse than starting from
  // zero.
  if (source.clock === undefined || source.clock === null) {
    const playerIds = Array.isArray(source.players)
      ? (source.players as { id?: unknown }[])
          .map((player) => player.id)
          .filter((id): id is string => typeof id === "string")
      : [];
    const startedAt =
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : typeof source.createdAt === "string"
          ? source.createdAt
          : new Date().toISOString();
    next.clock = createGameClock(
      playerIds as unknown as PlayerId[],
      startedAt as IsoTimestamp,
    );
    changed = true;
  }

  // The attack-resolution phase no longer exists. Saves paused there resume
  // wherever the turn would have continued once the attack was logged.
  const turn = source.turn;
  if (typeof turn === "object" && turn !== null) {
    const turnSource = turn as Record<string, unknown>;
    if (turnSource.phase === "resolving-barbarian-attack") {
      const official = (
        source.resolution as Record<string, unknown> | undefined
      )?.official as Record<string, unknown> | null | undefined;
      const officialPending =
        official != null &&
        (official.progressPending === true ||
          official.productionPending === true);
      const thematicPending =
        (source.thematicEvents as Record<string, unknown> | undefined)
          ?.pendingEvent != null;
      next.turn = {
        ...turnSource,
        phase: officialPending
          ? "resolving-official-result"
          : thematicPending
            ? "resolving-thematic-event"
            : "action-phase",
      };
      changed = true;
    }
  }

  return changed
    ? { state: next as unknown as GameState, changed: true }
    : { state, changed: false };
}

export function migrateCommand(command: PersistedCommand): {
  command: PersistedCommand;
  changed: boolean;
} {
  if (typeof command !== "object" || command === null) {
    return { command, changed: false };
  }
  const source = command as unknown as Record<string, unknown>;

  if (source.type === "attack.confirmed") {
    const result = stripKeys(source, ["manualOutcome", "progressChoices"]);
    return result.changed
      ? { command: result.value as unknown as PersistedCommand, changed: true }
      : { command, changed: false };
  }

  if (source.type === "player.publicStateAdjusted") {
    const patch = source.patch;
    if (typeof patch === "object" && patch !== null) {
      const result = stripKeys(
        patch as Record<string, unknown>,
        REMOVED_PLAYER_FIELDS,
      );
      if (result.changed) {
        return {
          command: {
            ...source,
            patch: result.value,
          } as unknown as PersistedCommand,
          changed: true,
        };
      }
    }
  }

  return { command, changed: false };
}

/**
 * Migrates a stored revision. The state hash is recomputed only when the state
 * actually changed, so untouched revisions keep their original hash and remain
 * byte-identical.
 */
export async function migrateStoredRevision(
  revision: StoredRevision,
): Promise<{ revision: StoredRevision; changed: boolean }> {
  const state = migrateGameState(revision.state);
  const command = migrateCommand(revision.command);
  if (!state.changed && !command.changed) {
    return { revision, changed: false };
  }
  const migrated: StoredRevision = {
    ...revision,
    state: state.state,
    command: command.command,
  };
  return {
    revision: state.changed
      ? { ...migrated, stateHash: await sha256(state.state) }
      : migrated,
    changed: true,
  };
}
