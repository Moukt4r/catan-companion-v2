import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  validateGameState,
} from "../../domain";
import type { GameSetup, GameState, PlayerState } from "../../domain";
import type { StoredRevision } from "../../application/persistence";
import { sha256 } from "../../application/integrity";
import {
  migrateCommand,
  migrateGameState,
  migrateStoredRevision,
} from "./migrations";
import { commandSchema, parseGameState } from "./schemas";

function sequentialIds() {
  let value = 0;
  return {
    next(kind: string) {
      value += 1;
      return `${kind}-migration-${value}`;
    },
  };
}

function setup(): GameSetup {
  const players = ["a", "b", "c"].map((suffix, index) => ({
    id: asPlayerId(`migration-player-${suffix}`),
    name: `Player ${suffix}`,
    color: {
      id: `migration-color-${suffix}`,
      label: `Color ${suffix}`,
      hex: ["#cc0000", "#0055cc", "#118833"][index] as string,
      distinguishabilityKey: `migration-key-${suffix}`,
    },
  }));
  return {
    title: "Migration test",
    mode: "standard",
    players,
    firstPlayerId: players[0]!.id,
    victoryTarget: 13,
    thematicEventPercent: 8,
    numberedReshuffleThreshold: 0,
    thematicEventsEnabled: false,
    thematicEventCatalog: [],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
  };
}

function currentState(): GameState {
  const result = createGame({
    gameId: asGameId("migration-game"),
    revisionId: asRevisionId("migration-revision"),
    createdAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
    setup: setup(),
    random: () => 0,
    ids: sequentialIds(),
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.nextState;
}

/**
 * A save written before city walls and inactive knights existed. Those keys
 * are absent entirely rather than zeroed.
 */
function legacyState(): GameState {
  const state = structuredClone(currentState());
  for (const player of state.players) {
    delete (player as Partial<PlayerState>).cityWalls;
    delete (player as Partial<PlayerState>).inactiveKnights;
  }
  return state;
}

describe("legacy save migration", () => {
  it("reproduces the failure that marked pre-walls saves corrupt", () => {
    // Schema defaults now let the legacy shape parse again...
    expect(() => parseGameState(legacyState())).not.toThrow();

    // ...but the raw stored record is still not a usable domain state, which
    // is exactly what caused every existing game to be written back as
    // `corrupt`. Validation cannot even complete on it.
    expect(() => validateGameState(legacyState())).toThrow();
  });

  it("fills in missing walls and inactive knights without touching other data", () => {
    const legacy = legacyState();
    const { state, changed } = migrateGameState(legacy);

    expect(changed).toBe(true);
    for (const player of state.players) {
      expect(player.cityWalls).toBe(0);
      expect(player.inactiveKnights).toEqual({
        basic: 0,
        strong: 0,
        mighty: 0,
      });
    }
    // Migrated state is a fully valid domain state again.
    expect(validateGameState(state)).toEqual([]);
    // Unrelated fields survive untouched.
    expect(state.players.map((player) => player.name)).toEqual(
      legacy.players.map((player) => player.name),
    );
    expect(state.id).toBe(legacy.id);
  });

  it("leaves an already-current save completely untouched", () => {
    const state = currentState();
    const result = migrateGameState(state);

    expect(result.changed).toBe(false);
    // Same object identity: no needless rewrite of healthy saves.
    expect(result.state).toBe(state);
  });

  it("never overwrites values a save already carries", () => {
    const state = structuredClone(currentState());
    state.players[0]!.ordinaryCities = 3;
    state.players[0]!.cityWalls = 2;
    state.players[0]!.inactiveKnights = { basic: 1, strong: 2, mighty: 0 };

    const migrated = migrateGameState(state);

    expect(migrated.changed).toBe(false);
    expect(migrated.state.players[0]!.cityWalls).toBe(2);
    expect(migrated.state.players[0]!.inactiveKnights).toEqual({
      basic: 1,
      strong: 2,
      mighty: 0,
    });
  });

  it("treats a legacy attack without an outcome as board-authoritative", () => {
    // A save written before manual outcomes existed: the key is absent.
    const legacy = {
      type: "attack.confirmed" as const,
      proposalId: "legacy-proposal",
    } as unknown as Parameters<typeof migrateCommand>[0];

    const { command, changed } = migrateCommand(legacy);

    expect(changed).toBe(true);
    expect(command).toMatchObject({
      type: "attack.confirmed",
      manualOutcome: { type: "board-authoritative" },
    });
    // The migrated command satisfies the strict persistence schema.
    expect(() => commandSchema.parse(command)).not.toThrow();
  });

  it("preserves a recorded attack outcome", () => {
    const recorded = {
      type: "attack.confirmed" as const,
      proposalId: "recorded-proposal" as never,
      manualOutcome: {
        type: "barbarians-win" as const,
        pillagedPlayerIds: [asPlayerId("migration-player-a")],
      },
      progressChoices: [],
    };

    const { command, changed } = migrateCommand(recorded);

    expect(changed).toBe(false);
    expect(command).toBe(recorded);
  });

  it("recomputes the state hash only when the state actually changed", async () => {
    const legacy = legacyState();
    const stale: StoredRevision = {
      id: asRevisionId("migration-revision"),
      gameId: asGameId("migration-game"),
      parentRevisionId: null,
      sequence: 1,
      commandId: "migration-command" as never,
      command: { type: "game.created" },
      summary: { kind: "game-created", text: "Created", playerIds: [] },
      state: legacy,
      // Hash of the pre-migration state, so it must be replaced.
      stateHash: await sha256(legacy),
      createdAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
      applicationVersion: "0.6.0",
      databaseSchemaVersion: 1,
      gameDocumentVersion: 1,
      rulesDataVersion: "2025.1",
    };

    const { revision, changed } = await migrateStoredRevision(stale);

    expect(changed).toBe(true);
    // The hash matches the migrated state, so the integrity check passes.
    expect(revision.stateHash).toBe(await sha256(revision.state));
    expect(revision.stateHash).not.toBe(stale.stateHash);
    expect(validateGameState(revision.state)).toEqual([]);
  });

  it("returns healthy revisions unchanged", async () => {
    const state = currentState();
    const healthy: StoredRevision = {
      id: asRevisionId("migration-revision"),
      gameId: asGameId("migration-game"),
      parentRevisionId: null,
      sequence: 1,
      commandId: "migration-command" as never,
      command: { type: "game.created" },
      summary: { kind: "game-created", text: "Created", playerIds: [] },
      state,
      stateHash: await sha256(state),
      createdAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
      applicationVersion: "0.6.1",
      databaseSchemaVersion: 1,
      gameDocumentVersion: 1,
      rulesDataVersion: "2025.1",
    };

    const result = await migrateStoredRevision(healthy);

    expect(result.changed).toBe(false);
    expect(result.revision).toBe(healthy);
    expect(result.revision.stateHash).toBe(healthy.stateHash);
  });
});
