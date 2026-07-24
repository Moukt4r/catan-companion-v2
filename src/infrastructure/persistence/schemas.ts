import { z } from "zod";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
} from "../../application/persistence";
import type {
  ExportDocument,
  StoredRevision,
} from "../../application/persistence";
import { persistenceError } from "../../application/errors";
import { scoreForPlayer, validateGameState } from "../../domain";
import type { GameState } from "../../domain";
import { sha256 } from "../../application/integrity";

const id = z.string().min(1).max(256);
const isoTimestamp = z.iso.datetime({ offset: true });
const integer = z.number().int();
const nonNegativeInteger = integer.min(0);
const die = integer.min(1).max(6);
const discipline = z.enum(["science", "trade", "politics"]);
const eventFace = z.enum(["barbarian", "science", "trade", "politics"]);

const colorSchema = z.strictObject({
  id,
  label: z.string().min(1).max(100),
  hex: z.string().regex(/^#[0-9a-f]{6}$/i),
  distinguishabilityKey: id,
});

const knightSchema = z.strictObject({
  basic: nonNegativeInteger,
  strong: nonNegativeInteger,
  mighty: nonNegativeInteger,
});

const improvementSchema = z.strictObject({
  science: integer.min(0).max(5),
  trade: integer.min(0).max(5),
  politics: integer.min(0).max(5),
});

const playerSetupSchema = z.strictObject({
  id,
  name: z.string().min(1).max(200),
  color: colorSchema,
  ordinaryCities: nonNegativeInteger.optional(),
  activeKnights: knightSchema.partial().optional(),
  improvements: improvementSchema.partial().optional(),
  initialScore: integer.optional(),
});

const worldEventTone = z.enum(["boon", "mixed", "setback"]);
const worldEventImpact = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const worldEventCategory = z.enum([
  "economy",
  "military",
  "diplomacy",
  "nature",
  "society",
]);
const worldEventScope = z.enum(["all", "active-player", "conditional"]);
const worldEventDuration = z.enum([
  "immediate",
  "rest-of-turn",
  "full-round",
  "until-next-occurrence",
  "until-resolved",
]);
const worldEventPrerequisite = z.enum([
  "knights",
  "cities",
  "improvements",
  "progress-cards",
  "robber",
  "maritime-trade",
]);
const worldEventCompatibility = z.strictObject({
  twoPlayer: z.boolean(),
  requires: z.array(worldEventPrerequisite).optional(),
});

const eventDefinitionSchema = z.strictObject({
  id,
  contentVersion: integer.min(1),
  title: z.string().min(1).max(500),
  instruction: z.string().min(1).max(5_000),
  // v2+ metadata — optional for backward compat with v1 saves
  tone: worldEventTone.optional(),
  impact: worldEventImpact.optional(),
  category: worldEventCategory.optional(),
  scope: worldEventScope.optional(),
  duration: worldEventDuration.optional(),
  compatibility: worldEventCompatibility.optional(),
});

const setupSchema = z.strictObject({
  title: z.string().min(1).max(200),
  mode: z.enum(["standard", "two-player-house-rule"]),
  players: z.array(playerSetupSchema).min(2).max(4),
  firstPlayerId: id,
  victoryTarget: integer.min(1).max(99),
  thematicCadence: z.enum(["subtle", "standard", "lively"]),
  thematicEventsEnabled: z.boolean(),
  thematicEventCatalog: z.array(eventDefinitionSchema).max(1_000),
  rulesDataVersion: id,
  gameDocumentVersion: integer.min(1),
});

const playerStateSchema = z.strictObject({
  id,
  name: z.string().min(1).max(200),
  color: colorSchema,
  order: nonNegativeInteger,
  ordinaryCities: nonNegativeInteger,
  activeKnights: knightSchema,
  improvements: improvementSchema,
});

const gameClockSchema = z.strictObject({
  totalActiveMs: nonNegativeInteger,
  currentTurnActiveMs: nonNegativeInteger,
  playerActiveMs: z.record(id, nonNegativeInteger),
  runningSince: isoTimestamp.nullable(),
  pausedAt: isoTimestamp.nullable(),
});

const deckMetadata = {
  cycle: integer.min(1),
  cursor: nonNegativeInteger,
  createdAtRevision: id,
};
const numberedDeckSchema = z.strictObject({
  ...deckMetadata,
  order: z.array(z.strictObject({ red: die, yellow: die })).max(36),
});
const eventDeckSchema = z.strictObject({
  ...deckMetadata,
  order: z.array(eventFace).max(6),
});
const triggerDeckSchema = z.strictObject({
  ...deckMetadata,
  order: z.array(z.strictObject({ trigger: z.boolean() })).max(100),
});
const thematicEventDeckSchema = z.strictObject({
  ...deckMetadata,
  order: z.array(id).max(1_000),
});

const activeWorldEventSchema = z.strictObject({
  occurrenceId: id,
  eventId: id,
  contentVersion: integer.min(1).default(1),
  title: z.string().min(1).max(500),
  instruction: z.string().min(1).max(5_000),
  tone: worldEventTone,
  impact: worldEventImpact,
  category: worldEventCategory,
  scope: worldEventScope,
  duration: worldEventDuration,
  compatibility: worldEventCompatibility,
  activeRound: integer.min(1).nullable(),
  triggeredAtCompletedTurn: nonNegativeInteger,
  activated: z.boolean(),
});

const thematicSnapshotSchema = z.strictObject({
  occurrenceId: id,
  eventId: id,
  contentVersion: integer.min(1),
  title: z.string().min(1).max(500),
  instruction: z.string().min(1).max(5_000),
  triggeredAtCompletedTurn: nonNegativeInteger,
  acknowledged: z.boolean(),
  // v2+ metadata — optional for backward compat
  tone: worldEventTone.optional(),
  impact: worldEventImpact.optional(),
  category: worldEventCategory.optional(),
  scope: worldEventScope.optional(),
  duration: worldEventDuration.optional(),
});

const metropolisControlSchema = z
  .strictObject({
    holderId: id,
    status: z.enum(["temporary", "permanent"]),
  })
  .nullable();
const metropolisControlsSchema = z.strictObject({
  science: metropolisControlSchema,
  trade: metropolisControlSchema,
  politics: metropolisControlSchema,
});
const metropolisProposalSchema = z
  .strictObject({
    id,
    discipline,
    source: z.enum(["improvement", "correction"]),
    from: metropolisControlSchema,
    to: metropolisControlSchema,
    changes: z.array(
      z.strictObject({
        playerId: id,
        ordinaryCityDelta: integer,
        scoreDelta: integer,
      }),
    ),
    summary: z.string().max(2_000),
  })
  .nullable();

const attackStrengthsSchema = z.strictObject({
  barbarian: nonNegativeInteger,
  defenders: nonNegativeInteger,
  contributions: z.array(
    z.strictObject({ playerId: id, strength: nonNegativeInteger }),
  ),
});
const attackOutcomeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("defenders-win"),
    reward: z.union([
      z.strictObject({
        type: z.literal("defender-point"),
        playerId: id,
      }),
      z.strictObject({
        type: z.literal("progress-choice"),
        playerIds: z.array(id),
      }),
    ]),
  }),
  z.strictObject({
    type: z.literal("barbarians-win"),
    pillagedPlayerIds: z.array(id),
  }),
]);
const attackProposalSchema = z
  .strictObject({
    id,
    strengths: attackStrengthsSchema,
    outcome: attackOutcomeSchema,
    firstAttack: z.boolean(),
    summary: z.string().max(2_000),
  })
  .nullable();
const attackRecordSchema = z.strictObject({
  proposalId: id,
  completedAt: isoTimestamp,
  strengths: attackStrengthsSchema,
  outcome: attackOutcomeSchema,
  progressChoices: z.array(z.strictObject({ playerId: id, discipline })),
});

const progressGuidanceSchema = z
  .strictObject({
    discipline,
    eligiblePlayerIds: z.array(id),
    red: die,
  })
  .nullable();
const productionGuidanceSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("production"),
    total: integer.min(2).max(12),
  }),
  z.strictObject({
    type: z.literal("seven"),
    robberActive: z.boolean(),
    reminder: z.enum(["robber-not-yet-active", "discard-and-move-robber"]),
  }),
]);
const rollSchema = z.strictObject({
  id,
  playerId: id,
  turnNumber: integer.min(1),
  round: integer.min(1),
  numbered: z.strictObject({ red: die, yellow: die }),
  total: integer.min(2).max(12),
  eventFace,
  alchemy: z.boolean(),
  numberedDeckCycle: integer.min(1),
  numberedDeckIndex: nonNegativeInteger.nullable(),
  eventDeckCycle: integer.min(1),
  eventDeckIndex: nonNegativeInteger,
  progress: progressGuidanceSchema,
  production: productionGuidanceSchema,
  thematicEventOccurrenceId: id.nullable(),
  createdAt: isoTimestamp,
});

const scoreEntrySchema = z.strictObject({
  id,
  playerId: id,
  delta: integer,
  reason: z.enum([
    "initial",
    "manual",
    "defender",
    "metropolis",
    "merchant",
    "longest-road",
    "revealed-progress-vp",
    "correction",
  ]),
  note: z.string().max(2_000).optional(),
  createdAt: isoTimestamp,
});

export const gameStateSchema = z.strictObject({
  id,
  revisionId: id,
  revisionNumber: integer.min(1),
  status: z.enum(["active", "completed"]),
  winnerId: id.nullable(),
  setup: setupSchema,
  turn: z.strictObject({
    phase: z.enum([
      "awaiting-roll",
      "resolving-official-result",
      "resolving-barbarian-attack",
      "resolving-thematic-event",
      "action-phase",
      "turn-complete",
      "completed",
    ]),
    currentPlayerIndex: nonNegativeInteger,
    round: integer.min(1),
    turnNumber: integer.min(1),
    completedTurns: nonNegativeInteger,
  }),
  clock: gameClockSchema.optional(),
  players: z.array(playerStateSchema).min(2).max(4),
  metropolises: z.strictObject({
    controls: metropolisControlsSchema,
    pendingProposal: metropolisProposalSchema,
  }),
  numberedDeck: numberedDeckSchema,
  eventDeck: eventDeckSchema,
  thematicEvents: z.strictObject({
    enabled: z.boolean(),
    cadence: z.enum(["subtle", "standard", "lively"]),
    enabledEvents: z.array(eventDefinitionSchema).max(1_000),
    triggerBag: triggerDeckSchema,
    eventDeck: thematicEventDeckSchema,
    deferredTrigger: z.boolean(),
    lastTriggeredAtCompletedTurn: nonNegativeInteger.nullable(),
    previousEventId: id.nullable(),
    pendingEvent: thematicSnapshotSchema.nullable(),
    activeEvents: z.array(activeWorldEventSchema).max(100).optional(),
  }),
  barbarian: z.strictObject({
    shipPosition: nonNegativeInteger,
    robberActivated: z.boolean(),
    attacksCompleted: nonNegativeInteger,
    rules: z.strictObject({
      trackLength: integer.min(1),
      knightComponentLimitPerLevel: integer.min(1),
    }),
    pendingAttack: attackProposalSchema,
    history: z.array(attackRecordSchema),
  }),
  resolution: z.strictObject({
    official: z
      .strictObject({
        rollId: id,
        progressPending: z.boolean(),
        productionPending: z.boolean(),
      })
      .nullable(),
  }),
  scoreLedger: z.array(scoreEntrySchema),
  lastRoll: rollSchema.nullable(),
  statistics: z.strictObject({
    totalRolls: nonNegativeInteger,
    normalRolls: nonNegativeInteger,
    alchemyRolls: nonNegativeInteger,
    completedTurns: nonNegativeInteger,
    completedRounds: nonNegativeInteger,
    numberedTotals: z.record(z.string(), nonNegativeInteger),
    eventFaces: z.strictObject({
      barbarian: nonNegativeInteger,
      science: nonNegativeInteger,
      trade: nonNegativeInteger,
      politics: nonNegativeInteger,
    }),
    barbarianAttacksWon: nonNegativeInteger,
    barbarianAttacksLost: nonNegativeInteger,
    thematicEventsTriggered: nonNegativeInteger,
  }),
  history: z.strictObject({
    rolls: z.array(rollSchema),
    thematicEvents: z.array(thematicSnapshotSchema),
  }),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

const publicPatchSchema = z.strictObject({
  name: z.string().max(200).optional(),
  ordinaryCities: nonNegativeInteger.optional(),
  activeKnights: knightSchema.partial().optional(),
  improvements: improvementSchema.partial().optional(),
  scoreAdjustment: z
    .strictObject({
      delta: integer,
      reason: z.enum([
        "manual",
        "merchant",
        "longest-road",
        "revealed-progress-vp",
        "correction",
      ]),
      note: z.string().max(2_000).optional(),
    })
    .optional(),
});

export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("game.created") }),
  z.strictObject({ type: z.literal("clock.started") }),
  z.strictObject({ type: z.literal("clock.paused") }),
  z.strictObject({ type: z.literal("clock.resumed") }),
  z.strictObject({ type: z.literal("roll.draw") }),
  z.strictObject({ type: z.literal("roll.alchemy"), red: die, yellow: die }),
  z.strictObject({
    type: z.literal("resolution.progressAcknowledged"),
    rollId: id,
  }),
  z.strictObject({
    type: z.literal("resolution.productionAcknowledged"),
    rollId: id,
  }),
  z.strictObject({
    type: z.literal("player.publicStateAdjusted"),
    playerId: id,
    patch: publicPatchSchema,
  }),
  z.strictObject({
    type: z.literal("metropolis.assignmentProposed"),
    discipline,
    holderId: id.nullable(),
    status: z.enum(["temporary", "permanent"]).nullable(),
  }),
  z.strictObject({
    type: z.literal("metropolis.correctionProposed"),
    discipline,
    holderId: id.nullable(),
    status: z.enum(["temporary", "permanent"]).nullable(),
  }),
  z.strictObject({
    type: z.literal("metropolis.proposalConfirmed"),
    proposalId: id,
  }),
  z.strictObject({
    type: z.literal("metropolis.proposalCancelled"),
    proposalId: id,
  }),
  z.strictObject({
    type: z.literal("attack.confirmed"),
    proposalId: id,
    progressChoices: z
      .array(z.strictObject({ playerId: id, discipline }))
      .optional(),
  }),
  z.strictObject({ type: z.literal("event.acknowledged"), occurrenceId: id }),
  z.strictObject({ type: z.literal("event.resolved"), occurrenceId: id }),
  z.strictObject({ type: z.literal("turn.ended") }),
  z.strictObject({ type: z.literal("game.completed"), winnerId: id }),
]);

export const journalSchema = z.strictObject({
  kind: z.enum([
    "game-created",
    "clock-started",
    "clock-paused",
    "clock-resumed",
    "roll-drawn",
    "alchemy-used",
    "resolution-acknowledged",
    "player-adjusted",
    "metropolis-proposed",
    "metropolis-confirmed",
    "metropolis-cancelled",
    "attack-confirmed",
    "thematic-event-acknowledged",
    "thematic-event-resolved",
    "turn-ended",
    "game-completed",
  ]),
  text: z.string().max(2_000),
  playerIds: z.array(id),
});

const revisionSchema = z.strictObject({
  id,
  gameId: id,
  parentRevisionId: id.nullable(),
  sequence: integer.min(1),
  commandId: id,
  command: commandSchema,
  summary: journalSchema,
  state: gameStateSchema,
  stateHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: isoTimestamp,
  applicationVersion: id,
  databaseSchemaVersion: integer.min(1),
  gameDocumentVersion: integer.min(1),
  rulesDataVersion: id,
});

const playerSummarySchema = z.strictObject({
  id,
  name: z.string().min(1).max(200),
  colorHex: z.string().regex(/^#[0-9a-f]{6}$/i),
  score: integer,
});
const gameSchema = z.strictObject({
  id,
  lifecycle: z.enum(["active", "completed", "archived", "corrupt"]),
  title: z.string().min(1).max(200),
  headRevisionId: id,
  latestRevisionId: id,
  redoStack: z.array(id),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  winnerId: id.optional(),
  players: z.array(playerSummarySchema).min(2).max(4),
  currentTurn: z.strictObject({
    playerId: id,
    playerName: z.string().min(1).max(200),
    round: integer.min(1),
    turnNumber: integer.min(1),
    phase: gameStateSchema.shape.turn.shape.phase,
  }),
  gameDocumentVersion: integer.min(1),
  rulesDataVersion: id,
});

const exportSchema = z.strictObject({
  format: z.literal(EXPORT_FORMAT),
  exportVersion: z.literal(EXPORT_VERSION),
  exportedAt: isoTimestamp,
  applicationVersion: id,
  game: gameSchema,
  activeBranch: z.array(revisionSchema).min(1).max(20_000),
  optionalBranches: z
    .array(z.array(revisionSchema).min(1))
    .max(20_000)
    .optional(),
  integrity: z.strictObject({
    algorithm: z.literal("SHA-256"),
    documentHash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});

export function parseGameState(value: unknown): GameState {
  const parsed = gameStateSchema.safeParse(value);
  if (!parsed.success) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Game state structure is invalid.",
    );
  }
  const state = parsed.data as GameState;
  const errors = validateGameState(state);
  if (errors.length > 0) {
    throw persistenceError(
      "INVALID_IMPORT",
      errors[0]?.message ?? "Invalid game state.",
    );
  }
  return state;
}

export async function parseExportDocument(input: unknown): Promise<{
  document: ExportDocument;
  revisions: StoredRevision[];
}> {
  let estimatedSize: number;
  try {
    estimatedSize = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  } catch (error) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Import is not JSON data.",
      {},
      error,
    );
  }
  if (estimatedSize > MAX_IMPORT_BYTES) {
    throw persistenceError(
      "IMPORT_TOO_LARGE",
      "Import exceeds the 10 MB limit.",
    );
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "exportVersion" in input &&
    input.exportVersion !== EXPORT_VERSION
  ) {
    throw persistenceError(
      "UNSUPPORTED_VERSION",
      "The export version is not supported.",
    );
  }
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Import document structure is invalid.",
    );
  }
  const document = parsed.data as ExportDocument;
  const unsigned = {
    ...document,
    integrity: { algorithm: "SHA-256" as const },
  };
  if ((await sha256(unsigned)) !== document.integrity.documentHash) {
    throw persistenceError(
      "INTEGRITY_FAILURE",
      "Import document hash does not match.",
    );
  }
  const revisions = deduplicateRevisions(document);
  validateRevisionGraph(document, revisions);
  for (const revision of revisions) {
    parseGameState(revision.state);
    if ((await sha256(revision.state)) !== revision.stateHash) {
      throw persistenceError(
        "INTEGRITY_FAILURE",
        "A revision state hash does not match.",
        { revisionId: revision.id },
      );
    }
  }
  return { document, revisions };
}

function deduplicateRevisions(document: ExportDocument): StoredRevision[] {
  const byId = new Map<string, StoredRevision>();
  for (const revision of [
    ...document.activeBranch,
    ...(document.optionalBranches ?? []).flat(),
  ]) {
    const existing = byId.get(revision.id);
    if (
      existing !== undefined &&
      JSON.stringify(existing) !== JSON.stringify(revision)
    ) {
      throw persistenceError(
        "INVALID_IMPORT",
        "A revision ID has conflicting records.",
      );
    }
    byId.set(revision.id, revision);
  }
  return [...byId.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
}

function validateRevisionGraph(
  document: ExportDocument,
  revisions: StoredRevision[],
): void {
  const { game } = document;
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  if (!byId.has(game.headRevisionId) || !byId.has(game.latestRevisionId)) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Game heads must reference imported revisions.",
    );
  }
  for (const revision of revisions) {
    if (
      revision.gameId !== game.id ||
      revision.state.id !== game.id ||
      revision.state.revisionId !== revision.id ||
      revision.state.revisionNumber !== revision.sequence
    ) {
      throw persistenceError(
        "INVALID_IMPORT",
        "Revision identity fields are inconsistent.",
      );
    }
    if (revision.parentRevisionId === null) {
      if (revision.sequence !== 1 || revision.command.type !== "game.created") {
        throw persistenceError(
          "INVALID_IMPORT",
          "The root revision is invalid.",
        );
      }
    } else {
      const parent = byId.get(revision.parentRevisionId);
      if (parent === undefined || parent.sequence + 1 !== revision.sequence) {
        throw persistenceError(
          "INVALID_IMPORT",
          "Revision parent chain is invalid.",
        );
      }
    }
  }
  const roots = revisions.filter(
    (revision) => revision.parentRevisionId === null,
  );
  if (roots.length !== 1) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Revision history must have one root.",
    );
  }
  for (const revision of revisions) {
    const seen = new Set<string>();
    let current: StoredRevision | undefined = revision;
    while (current.parentRevisionId !== null) {
      if (seen.has(current.id)) {
        throw persistenceError(
          "INVALID_IMPORT",
          "Revision history contains a cycle.",
        );
      }
      seen.add(current.id);
      current = byId.get(current.parentRevisionId);
      if (current === undefined) {
        throw persistenceError(
          "INVALID_IMPORT",
          "Revision history is disconnected.",
        );
      }
    }
    if (current.id !== roots[0]?.id) {
      throw persistenceError(
        "INVALID_IMPORT",
        "Revision history is disconnected.",
      );
    }
  }
  validateBranch(document.activeBranch, game.headRevisionId);
  for (const branch of document.optionalBranches ?? []) {
    const leaf = branch.at(-1);
    if (leaf === undefined) {
      throw persistenceError("INVALID_IMPORT", "An optional branch is empty.");
    }
    validateBranch(branch, leaf.id);
  }
  const head = byId.get(game.headRevisionId);
  const lifecycleMatchesState =
    head?.state.status === "completed"
      ? game.lifecycle === "completed"
      : game.lifecycle === "active" || game.lifecycle === "archived";
  const winnerMatches =
    head !== undefined &&
    (head.state.winnerId === null
      ? game.winnerId === undefined
      : game.winnerId === head.state.winnerId);
  const completionMatches =
    head?.state.status === "completed"
      ? game.completedAt === head.state.updatedAt
      : game.completedAt === undefined;
  if (
    head === undefined ||
    !lifecycleMatchesState ||
    !winnerMatches ||
    !completionMatches ||
    game.title !== head.state.setup.title ||
    game.gameDocumentVersion !== head.state.setup.gameDocumentVersion ||
    game.rulesDataVersion !== head.state.setup.rulesDataVersion ||
    game.currentTurn.playerId !==
      head.state.players[head.state.turn.currentPlayerIndex]?.id ||
    game.currentTurn.round !== head.state.turn.round ||
    game.currentTurn.turnNumber !== head.state.turn.turnNumber ||
    game.currentTurn.phase !== head.state.turn.phase ||
    game.players.length !== head.state.players.length ||
    game.players.some(
      (player) =>
        !head.state.players.some(
          (statePlayer) =>
            statePlayer.id === player.id &&
            statePlayer.name === player.name &&
            statePlayer.color.hex === player.colorHex &&
            scoreForPlayer(head.state, statePlayer.id) === player.score,
        ),
    )
  ) {
    throw persistenceError(
      "INVALID_IMPORT",
      "Stored game summary does not match its head revision.",
    );
  }
  for (const redoId of game.redoStack) {
    if (!byId.has(redoId)) {
      throw persistenceError(
        "INVALID_IMPORT",
        "Redo stack references a missing revision.",
      );
    }
  }

  function validateBranch(
    branch: StoredRevision[],
    expectedLeafId: StoredRevision["id"],
  ): void {
    if (
      branch.length === 0 ||
      branch.at(-1)?.id !== expectedLeafId ||
      branch.some((revision, index) =>
        index === 0
          ? revision.parentRevisionId !== null
          : revision.parentRevisionId !== branch[index - 1]?.id,
      )
    ) {
      throw persistenceError(
        "INVALID_IMPORT",
        "Active revision chain is invalid.",
      );
    }
  }
}
