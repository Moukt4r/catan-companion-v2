import { describe, expect, it } from "vitest";
import {
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asRevisionId,
  createGame,
  validateGameState,
} from "../../domain";
import type { GameSetup, GameState } from "../../domain";
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
 * A save written while the app still mirrored board-owned bookkeeping:
 * cities, walls, knights, attack proposals and win/loss counters.
 */
function legacyState(
  overrides: (raw: Record<string, unknown>) => void = () => {
    /* no overrides */
  },
): GameState {
  const raw = structuredClone(currentState()) as unknown as Record<
    string,
    unknown
  >;
  for (const player of raw.players as Record<string, unknown>[]) {
    player.ordinaryCities = 2;
    player.cityWalls = 1;
    player.activeKnights = { basic: 1, strong: 0, mighty: 0 };
    player.inactiveKnights = { basic: 0, strong: 1, mighty: 0 };
  }
  const setupBlock = raw.setup as Record<string, unknown>;
  for (const player of setupBlock.players as Record<string, unknown>[]) {
    player.ordinaryCities = 2;
    player.cityWalls = 1;
  }
  const barbarian = raw.barbarian as Record<string, unknown>;
  (barbarian.rules as Record<string, unknown>).knightComponentLimitPerLevel = 2;
  barbarian.pendingAttack = null;
  const statistics = raw.statistics as Record<string, unknown>;
  delete statistics.barbarianAttacks;
  statistics.barbarianAttacksWon = 2;
  statistics.barbarianAttacksLost = 1;
  overrides(raw);
  return raw as unknown as GameState;
}

describe("removing board-owned bookkeeping from legacy saves", () => {
  it("reproduces the failure a bare schema change would have caused", () => {
    // The schema is strict, so an unmigrated legacy save is rejected for
    // carrying keys the app no longer knows about. Without migration this is
    // exactly what would mark every existing game `corrupt`.
    expect(() => parseGameState(legacyState())).toThrow();

    // After migration the same save parses and is a valid domain state.
    const migrated = migrateGameState(legacyState());
    expect(migrated.changed).toBe(true);
    expect(() => parseGameState(migrated.state)).not.toThrow();
    expect(validateGameState(migrated.state)).toEqual([]);
  });

  it("strips board-owned fields from players and setup", () => {
    const { state } = migrateGameState(legacyState());

    for (const player of state.players) {
      expect(player).not.toHaveProperty("ordinaryCities");
      expect(player).not.toHaveProperty("cityWalls");
      expect(player).not.toHaveProperty("activeKnights");
      expect(player).not.toHaveProperty("inactiveKnights");
      // Improvements survive: they drive progress-card eligibility.
      expect(player.improvements).toBeDefined();
    }
    for (const player of state.setup.players) {
      expect(player).not.toHaveProperty("ordinaryCities");
      expect(player).not.toHaveProperty("cityWalls");
    }
  });

  it("keeps identity and unrelated data untouched", () => {
    const legacy = legacyState();
    const { state } = migrateGameState(legacy);

    expect(state.id).toBe(legacy.id);
    expect(state.players.map((player) => player.name)).toEqual(
      legacy.players.map((player) => player.name),
    );
    expect(state.players.map((player) => player.order)).toEqual([0, 1, 2]);
    expect(state.scoreLedger).toEqual(legacy.scoreLedger);
  });

  it("folds attack win/loss counters into a single attack count", () => {
    const { state } = migrateGameState(legacyState());

    expect(state.statistics.barbarianAttacks).toBe(3);
    expect(state.statistics).not.toHaveProperty("barbarianAttacksWon");
    expect(state.statistics).not.toHaveProperty("barbarianAttacksLost");
  });

  it("reduces recorded attack history to what the app still owns", () => {
    const legacy = legacyState((raw) => {
      const barbarian = raw.barbarian as Record<string, unknown>;
      barbarian.history = [
        {
          proposalId: "old-attack",
          completedAt: "2026-07-20T10:00:00.000Z",
          strengths: { barbarian: 4, defenders: 2, contributions: [] },
          outcome: { type: "barbarians-win", pillagedPlayerIds: [] },
          progressChoices: [],
        },
      ];
    });

    const { state } = migrateGameState(legacy);

    expect(state.barbarian.history).toEqual([
      {
        proposalId: "old-attack",
        completedAt: "2026-07-20T10:00:00.000Z",
      },
    ]);
  });

  it("completes a save that was paused mid-attack", () => {
    // A game stopped in the old attack-resolution phase must not strand the
    // table. The board already settled it, so the migration logs the attack,
    // resets the ship and arms the robber.
    const legacy = legacyState((raw) => {
      const barbarian = raw.barbarian as Record<string, unknown>;
      barbarian.shipPosition = 7;
      barbarian.robberActivated = false;
      barbarian.attacksCompleted = 0;
      barbarian.pendingAttack = {
        id: "pending-1",
        strengths: { barbarian: 3, defenders: 1, contributions: [] },
        outcome: { type: "barbarians-win", pillagedPlayerIds: [] },
        firstAttack: true,
        summary: "The barbarians win.",
      };
      (raw.turn as Record<string, unknown>).phase =
        "resolving-barbarian-attack";
    });

    const { state } = migrateGameState(legacy);

    expect(state.barbarian).not.toHaveProperty("pendingAttack");
    expect(state.barbarian.shipPosition).toBe(0);
    expect(state.barbarian.robberActivated).toBe(true);
    expect(state.barbarian.attacksCompleted).toBe(1);
    expect(state.barbarian.history.at(-1)?.proposalId).toBe("pending-1");
    // The removed phase must resolve to a phase that still exists.
    expect(state.turn.phase).toBe("action-phase");
    expect(validateGameState(state)).toEqual([]);
  });

  it("drops the knight component limit from barbarian rules", () => {
    const { state } = migrateGameState(legacyState());

    expect(state.barbarian.rules).not.toHaveProperty(
      "knightComponentLimitPerLevel",
    );
    expect(state.barbarian.rules.trackLength).toBe(7);
  });

  it("leaves an already-current save completely untouched", () => {
    const state = currentState();
    const result = migrateGameState(state);

    expect(result.changed).toBe(false);
    // Same object identity: no needless rewrite of healthy saves.
    expect(result.state).toBe(state);
  });

  it("strips removed fields from recorded commands", () => {
    const legacyAdjust = {
      type: "player.publicStateAdjusted",
      playerId: "migration-player-a",
      patch: {
        ordinaryCities: 3,
        cityWalls: 1,
        activeKnights: { basic: 1 },
        improvements: { science: 2 },
      },
    } as unknown as Parameters<typeof migrateCommand>[0];

    const { command, changed } = migrateCommand(legacyAdjust);

    expect(changed).toBe(true);
    expect(command).toEqual({
      type: "player.publicStateAdjusted",
      playerId: "migration-player-a",
      patch: { improvements: { science: 2 } },
    });
    expect(() => commandSchema.parse(command)).not.toThrow();
  });

  it("reduces a legacy attack command to its identity", () => {
    const legacyAttack = {
      type: "attack.confirmed",
      proposalId: "legacy-proposal",
      manualOutcome: { type: "board-authoritative" },
      progressChoices: [],
    } as unknown as Parameters<typeof migrateCommand>[0];

    const { command, changed } = migrateCommand(legacyAttack);

    expect(changed).toBe(true);
    expect(command).toEqual({
      type: "attack.confirmed",
      proposalId: "legacy-proposal",
    });
    expect(() => commandSchema.parse(command)).not.toThrow();
  });

  it("leaves commands that carry no removed fields alone", () => {
    const command = { type: "turn.ended" } as Parameters<
      typeof migrateCommand
    >[0];

    const result = migrateCommand(command);

    expect(result.changed).toBe(false);
    expect(result.command).toBe(command);
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
      stateHash: await sha256(legacy),
      createdAt: asIsoTimestamp("2026-07-25T12:00:00.000Z"),
      applicationVersion: "0.6.1",
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
      applicationVersion: "0.6.2",
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
