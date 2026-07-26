import type { GameState, PlayerState } from "../../domain";
import type {
  PersistedCommand,
  StoredRevision,
} from "../../application/persistence";
import { sha256 } from "../../application/integrity";

/**
 * Saves written before city walls and inactive knights existed omit those
 * player fields, and attacks recorded before manual outcomes existed omit
 * `manualOutcome`. Without migration the strict persistence schema rejects
 * those records and every pre-existing game is written back as `corrupt`.
 *
 * Migration is deliberately additive: it only fills in fields that are
 * missing, never rewrites values that a save already carries.
 */

const NO_KNIGHTS = { basic: 0, strong: 0, mighty: 0 } as const;

type LegacyPlayerState = Omit<PlayerState, "inactiveKnights" | "cityWalls"> &
  Partial<Pick<PlayerState, "inactiveKnights" | "cityWalls">>;

function migratePlayer(player: PlayerState): {
  player: PlayerState;
  changed: boolean;
} {
  const legacy = player as LegacyPlayerState;
  const missingKnights = legacy.inactiveKnights === undefined;
  const missingWalls = legacy.cityWalls === undefined;
  if (!missingKnights && !missingWalls) {
    return { player, changed: false };
  }
  return {
    player: {
      ...player,
      inactiveKnights: legacy.inactiveKnights ?? { ...NO_KNIGHTS },
      cityWalls: legacy.cityWalls ?? 0,
    },
    changed: true,
  };
}

export function migrateGameState(state: GameState): {
  state: GameState;
  changed: boolean;
} {
  let changed = false;
  const players = state.players.map((player) => {
    const result = migratePlayer(player);
    changed ||= result.changed;
    return result.player;
  });
  if (!changed) {
    return { state, changed: false };
  }
  return { state: { ...state, players }, changed: true };
}

export function migrateCommand(command: PersistedCommand): {
  command: PersistedCommand;
  changed: boolean;
} {
  if (command.type !== "attack.confirmed") {
    return { command, changed: false };
  }
  const legacy = command as typeof command & {
    manualOutcome?: unknown;
  };
  if (legacy.manualOutcome !== undefined) {
    return { command, changed: false };
  }
  // Attacks recorded before manual outcomes existed were always resolved on
  // the physical board, which is exactly what board-authoritative means.
  return {
    command: { ...command, manualOutcome: { type: "board-authoritative" } },
    changed: true,
  };
}

/**
 * Migrates a stored revision in place. The state hash is recomputed only when
 * the state actually changed, so untouched revisions keep their original hash
 * and remain byte-identical.
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
