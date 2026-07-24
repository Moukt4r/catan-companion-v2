import { describe, expect, it } from "vitest";
import {
  asEventId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asProposalId,
  asRevisionId,
  asRollId,
  asScoreEntryId,
  createGame,
  isDiscipline,
  isEventFace,
  isTriggerToken,
  validateGameState,
  validateSetup,
} from "./index";
import type { DomainErrorCode, GameSetup, GameState, IdSource } from "./types";

const PLAYER_IDS = [
  asPlayerId("player-a"),
  asPlayerId("player-b"),
  asPlayerId("player-c"),
];

function ids(): IdSource {
  let next = 0;
  return {
    next(kind) {
      next += 1;
      return `${kind}-${next}`;
    },
  };
}

function setup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    title: "Invariant test",
    mode: "standard",
    players: PLAYER_IDS.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
      color: {
        id: `color-${index}`,
        label: `Color ${index}`,
        hex: "#123456",
        distinguishabilityKey: `key-${index}`,
      },
    })),
    firstPlayerId: PLAYER_IDS[0]!,
    victoryTarget: 13,
    thematicCadence: "standard",
    thematicEventsEnabled: true,
    thematicEventCatalog: [
      {
        id: asEventId("event"),
        contentVersion: 1,
        title: "Event",
        instruction: "Do the event.",
      },
    ],
    rulesDataVersion: "2025.1",
    gameDocumentVersion: 1,
    ...overrides,
  };
}

function game(overrides: Partial<GameSetup> = {}): GameState {
  const result = createGame({
    gameId: asGameId("game"),
    revisionId: asRevisionId("revision"),
    createdAt: asIsoTimestamp("2026-07-12T00:00:00Z"),
    setup: setup(overrides),
    random: () => 0,
    ids: ids(),
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.nextState;
}

function codes(state: GameState): DomainErrorCode[] {
  return validateGameState(state).map(({ code }) => code);
}

function expectCode(state: GameState, code: DomainErrorCode): void {
  expect(codes(state)).toContain(code);
}

describe("setup invariants", () => {
  it.each([
    [
      "too few standard players",
      setup({ players: setup().players.slice(0, 2) }),
    ],
    [
      "too many standard players",
      setup({
        players: [
          ...setup().players,
          {
            ...setup().players[0]!,
            id: asPlayerId("player-d"),
            name: "Player 4",
            color: {
              id: "color-4",
              label: "Color 4",
              hex: "#abcdef",
              distinguishabilityKey: "key-4",
            },
          },
          {
            ...setup().players[0]!,
            id: asPlayerId("player-e"),
            name: "Player 5",
            color: {
              id: "color-5",
              label: "Color 5",
              hex: "#fedcba",
              distinguishabilityKey: "key-5",
            },
          },
        ],
      }),
    ],
    [
      "wrong two-player count",
      setup({ mode: "two-player-house-rule" as const }),
    ],
  ])("rejects %s", (_, invalid) => {
    expect(validateSetup(invalid)).toContainEqual(
      expect.objectContaining({ code: "INVALID_SETUP" }),
    );
  });

  it("accepts the exact two-player house-rule count", () => {
    const twoPlayer = setup({
      mode: "two-player-house-rule",
      players: setup().players.slice(0, 2),
    });
    expect(validateSetup(twoPlayer)).toEqual([]);
  });

  it.each([
    [
      "duplicate IDs",
      (value: GameSetup) => {
        value.players[1]!.id = value.players[0]!.id;
      },
    ],
    [
      "empty IDs",
      (value: GameSetup) => {
        value.players[0]!.id = asPlayerId(" ");
      },
    ],
    [
      "duplicate names ignoring case",
      (value: GameSetup) => {
        value.players[1]!.name = " player 1 ";
      },
    ],
    [
      "empty names",
      (value: GameSetup) => {
        value.players[0]!.name = " ";
      },
    ],
    [
      "duplicate color IDs",
      (value: GameSetup) => {
        value.players[1]!.color.id = value.players[0]!.color.id;
      },
    ],
    [
      "duplicate color labels",
      (value: GameSetup) => {
        value.players[1]!.color.label = value.players[0]!.color.label;
      },
    ],
    [
      "duplicate color keys",
      (value: GameSetup) => {
        value.players[1]!.color.distinguishabilityKey =
          value.players[0]!.color.distinguishabilityKey;
      },
    ],
    [
      "empty color metadata",
      (value: GameSetup) => {
        value.players[0]!.color.id = " ";
        value.players[1]!.color.label = " ";
        value.players[2]!.color.distinguishabilityKey = " ";
      },
    ],
    [
      "invalid color hex",
      (value: GameSetup) => {
        value.players[0]!.color.hex = "#123";
      },
    ],
    [
      "unknown first player",
      (value: GameSetup) => {
        value.firstPlayerId = asPlayerId("missing");
      },
    ],
    [
      "empty title",
      (value: GameSetup) => {
        value.title = " ";
      },
    ],
    [
      "empty rules version",
      (value: GameSetup) => {
        value.rulesDataVersion = " ";
      },
    ],
    [
      "invalid document version",
      (value: GameSetup) => {
        value.gameDocumentVersion = 0;
      },
    ],
    [
      "empty required event catalog",
      (value: GameSetup) => {
        value.thematicEventCatalog = [];
      },
    ],
    [
      "duplicate event IDs",
      (value: GameSetup) => {
        value.thematicEventCatalog.push({
          ...value.thematicEventCatalog[0]!,
        });
      },
    ],
    [
      "blank event content",
      (value: GameSetup) => {
        value.thematicEventCatalog[0] = {
          ...value.thematicEventCatalog[0]!,
          id: asEventId(" "),
          title: " ",
          instruction: " ",
        };
      },
    ],
    [
      "invalid event version",
      (value: GameSetup) => {
        value.thematicEventCatalog[0]!.contentVersion = 0;
      },
    ],
  ])("rejects %s", (_, mutate) => {
    const invalid = structuredClone(setup());
    mutate(invalid);
    expect(validateSetup(invalid).map(({ code }) => code)).toContain(
      "INVALID_SETUP",
    );
  });

  it.each([0, 100, 1.5])("rejects victory target %s", (victoryTarget) => {
    expect(validateSetup(setup({ victoryTarget }))).toContainEqual(
      expect.objectContaining({ code: "INVALID_SETUP" }),
    );
  });

  it("requires World Events when Seasons Mode is enabled", () => {
    expect(
      validateSetup(
        setup({
          thematicEventsEnabled: false,
          thematicEventCatalog: [],
          seasonConfig: {
            enabled: true,
            roundsPerSeason: 3,
            startingSeason: "spring",
          },
        }),
      ).map(({ code }) => code),
    ).toContain("INVALID_SETUP");
  });

  it("rejects invalid persisted Seasons configuration", () => {
    const invalid = setup({
      seasonConfig: {
        enabled: false,
        roundsPerSeason: 3,
        startingSeason: "spring",
      },
    });
    invalid.seasonConfig!.roundsPerSeason = 5 as 3;
    invalid.seasonConfig!.startingSeason = "monsoon" as "spring";
    expect(validateSetup(invalid).map(({ code }) => code)).toContain(
      "INVALID_SETUP",
    );
  });

  it("allows an empty event catalog when thematic events are disabled", () => {
    expect(
      validateSetup(
        setup({
          thematicEventsEnabled: false,
          thematicEventCatalog: [],
        }),
      ),
    ).toEqual([]);
  });
});

describe("persisted game invariants", () => {
  it("rejects empty IDs and invalid revision numbers", () => {
    expectCode(
      { ...game(), id: asGameId(" "), revisionId: asRevisionId(" ") },
      "INVARIANT_VIOLATION",
    );
    for (const revisionNumber of [0, 1.5]) {
      expectCode({ ...game(), revisionNumber }, "INVARIANT_VIOLATION");
    }
  });

  it("rejects mismatched players, names, order, counters, and improvements", () => {
    const missing = game();
    missing.players.pop();
    expectCode(missing, "INVALID_PLAYER_STATE");

    const wrongIdentity = game();
    wrongIdentity.players[0]!.id = asPlayerId("other");
    expectCode(wrongIdentity, "INVALID_PLAYER_STATE");

    const duplicate = game();
    duplicate.players[1]!.id = duplicate.players[0]!.id;
    expectCode(duplicate, "INVALID_PLAYER_STATE");

    const names = game();
    names.players[0]!.name = " ";
    names.players[1]!.name = names.players[2]!.name;
    expectCode(names, "INVALID_PLAYER_STATE");

    const order = game();
    order.players[0]!.order = 2;
    expectCode(order, "INVALID_PLAYER_STATE");

    for (const ordinaryCities of [-1, 1.5]) {
      const state = game();
      state.players[0]!.ordinaryCities = ordinaryCities;
      expectCode(state, "INVALID_PLAYER_STATE");
    }

    for (const count of [-1, 1.5, 3]) {
      const state = game();
      state.players[0]!.activeKnights.basic = count;
      expectCode(state, "INVALID_PLAYER_STATE");
    }

    for (const level of [-1, 1.5, 6]) {
      const state = game();
      state.players[0]!.improvements.science = level as never;
      expectCode(state, "INVALID_PLAYER_STATE");
    }
  });

  it("rejects invalid metropolis holders, levels, proposals, and city counts", () => {
    const unknown = game();
    unknown.metropolises.controls.science = {
      holderId: asPlayerId("missing"),
      status: "temporary",
    };
    expectCode(unknown, "INVALID_METROPOLIS_STATE");

    for (const status of ["temporary", "permanent"] as const) {
      const underLevel = game();
      underLevel.metropolises.controls.science = {
        holderId: PLAYER_IDS[0]!,
        status,
      };
      expectCode(underLevel, "INVALID_METROPOLIS_STATE");
    }

    const staleProposal = game();
    staleProposal.metropolises.pendingProposal = {
      id: asProposalId("proposal"),
      discipline: "science",
      source: "correction",
      from: { holderId: PLAYER_IDS[0]!, status: "temporary" },
      to: null,
      changes: [],
      summary: "stale",
    };
    expectCode(staleProposal, "INVALID_METROPOLIS_STATE");

    const negativePieces = game();
    negativePieces.players[0]!.ordinaryCities = -1;
    expectCode(negativePieces, "INVALID_METROPOLIS_STATE");
  });

  it("rejects duplicate, malformed, unknown-player, and negative score entries", () => {
    const duplicate = game();
    duplicate.scoreLedger.push({ ...duplicate.scoreLedger[0]! });
    expectCode(duplicate, "INVALID_SCORE");

    for (const delta of [0, 1.5]) {
      const malformed = game();
      malformed.scoreLedger[0]!.delta = delta;
      expectCode(malformed, "INVALID_SCORE");
    }

    const unknown = game();
    unknown.scoreLedger[0]!.playerId = asPlayerId("missing");
    expectCode(unknown, "INVALID_SCORE");

    const negative = game();
    negative.scoreLedger.push({
      id: asScoreEntryId("negative"),
      playerId: PLAYER_IDS[0]!,
      delta: -4,
      reason: "correction",
      createdAt: asIsoTimestamp("2026-07-12T00:00:00Z"),
    });
    expectCode(negative, "INVALID_SCORE");
  });

  it("rejects every invalid deck metadata boundary and composition error", () => {
    const mutations: Array<(state: GameState) => void> = [
      (state) => {
        state.numberedDeck.cycle = 0;
      },
      (state) => {
        state.numberedDeck.cycle = 1.5;
      },
      (state) => {
        state.numberedDeck.cursor = -1;
      },
      (state) => {
        state.numberedDeck.cursor = 1.5;
      },
      (state) => {
        state.numberedDeck.cursor = 37;
      },
      (state) => {
        state.numberedDeck.order.pop();
      },
      (state) => {
        state.numberedDeck.createdAtRevision = asRevisionId(" ");
      },
    ];
    for (const mutate of mutations) {
      const state = game();
      mutate(state);
      expectCode(state, "INVALID_DECK_STATE");
    }

    const numberedComposition = game();
    numberedComposition.numberedDeck.order[0] =
      numberedComposition.numberedDeck.order[1]!;
    expectCode(numberedComposition, "INVALID_DECK_STATE");

    const eventComposition = game();
    eventComposition.eventDeck.order[0] = "science";
    expectCode(eventComposition, "INVALID_DECK_STATE");
  });

  it("rejects thematic trigger, deck, pending-event, and definition corruption", () => {
    const triggerCount = game();
    triggerCount.thematicEvents.triggerBag.order =
      triggerCount.thematicEvents.triggerBag.order.map(() => ({
        trigger: false,
      }));
    expectCode(triggerCount, "INVALID_THEMATIC_STATE");

    const eventDeck = game();
    eventDeck.thematicEvents.eventDeck.order[0] = asEventId("missing");
    expectCode(eventDeck, "INVALID_THEMATIC_STATE");

    const pending = game();
    pending.thematicEvents.pendingEvent = {
      occurrenceId: "occurrence" as never,
      eventId: asEventId("missing"),
      contentVersion: 1,
      title: "Missing",
      instruction: "Missing",
      triggeredAtCompletedTurn: 3,
      acknowledged: false,
    };
    expectCode(pending, "INVALID_THEMATIC_STATE");

    const disabled = game({
      thematicEventsEnabled: false,
      thematicEventCatalog: [],
    });
    disabled.thematicEvents.eventDeck.order = [asEventId("unexpected")];
    expectCode(disabled, "INVALID_THEMATIC_STATE");

    const disabledCursor = game({
      thematicEventsEnabled: false,
      thematicEventCatalog: [],
    });
    disabledCursor.thematicEvents.eventDeck.cursor = 1;
    expectCode(disabledCursor, "INVALID_THEMATIC_STATE");
  });

  it("rejects barbarian metadata and pending attacks away from the final space", () => {
    const mutations: Array<(state: GameState) => void> = [
      (state) => {
        state.barbarian.rules.trackLength = 0;
      },
      (state) => {
        state.barbarian.rules.trackLength = 1.5;
      },
      (state) => {
        state.barbarian.rules.knightComponentLimitPerLevel = 0;
      },
      (state) => {
        state.barbarian.rules.knightComponentLimitPerLevel = 1.5;
      },
      (state) => {
        state.barbarian.shipPosition = -1;
      },
      (state) => {
        state.barbarian.shipPosition = 1.5;
      },
      (state) => {
        state.barbarian.shipPosition = 8;
      },
      (state) => {
        state.barbarian.attacksCompleted = -1;
      },
      (state) => {
        state.barbarian.attacksCompleted = 1.5;
      },
    ];
    for (const mutate of mutations) {
      const state = game();
      mutate(state);
      expectCode(state, "INVALID_BARBARIAN_STATE");
    }

    const pending = game();
    pending.barbarian.pendingAttack = {
      id: asProposalId("attack"),
      strengths: { barbarian: 3, defenders: 0, contributions: [] },
      firstAttack: true,
      outcome: { type: "barbarians-win", pillagedPlayerIds: [] },
      summary: "Attack",
    };
    expectCode(pending, "INVALID_BARBARIAN_STATE");
  });

  it("rejects resolution phases without their referenced pending work", () => {
    const wrongRoll = game();
    wrongRoll.resolution.official = {
      rollId: asRollId("missing"),
      progressPending: false,
      productionPending: true,
    };
    expectCode(wrongRoll, "INVALID_RESOLUTION_STATE");

    const noOfficial = game();
    noOfficial.turn.phase = "resolving-official-result";
    expectCode(noOfficial, "INVALID_RESOLUTION_STATE");

    const noSteps = game();
    noSteps.turn.phase = "resolving-official-result";
    noSteps.resolution.official = {
      rollId: asRollId("roll"),
      progressPending: false,
      productionPending: false,
    };
    noSteps.lastRoll = { id: asRollId("roll") } as GameState["lastRoll"];
    expectCode(noSteps, "INVALID_RESOLUTION_STATE");

    const noAttack = game();
    noAttack.turn.phase = "resolving-barbarian-attack";
    expectCode(noAttack, "INVALID_RESOLUTION_STATE");

    const noEvent = game();
    noEvent.turn.phase = "resolving-thematic-event";
    expectCode(noEvent, "INVALID_RESOLUTION_STATE");
  });

  it("rejects every invalid turn boundary and inconsistent completion state", () => {
    const mutations: Array<(state: GameState) => void> = [
      (state) => {
        state.turn.currentPlayerIndex = -1;
      },
      (state) => {
        state.turn.currentPlayerIndex = 1.5;
      },
      (state) => {
        state.turn.currentPlayerIndex = state.players.length;
      },
      (state) => {
        state.turn.round = 0;
      },
      (state) => {
        state.turn.round = 1.5;
      },
      (state) => {
        state.turn.turnNumber = 0;
      },
      (state) => {
        state.turn.turnNumber = 1.5;
      },
      (state) => {
        state.turn.completedTurns = -1;
      },
      (state) => {
        state.turn.completedTurns = 1.5;
      },
    ];
    for (const mutate of mutations) {
      const state = game();
      mutate(state);
      expectCode(state, "INVARIANT_VIOLATION");
    }

    const statusOnly = game();
    statusOnly.status = "completed";
    expectCode(statusOnly, "INVARIANT_VIOLATION");

    const phaseOnly = game();
    phaseOnly.turn.phase = "completed";
    expectCode(phaseOnly, "INVARIANT_VIOLATION");

    const unknownWinner = game();
    unknownWinner.status = "completed";
    unknownWinner.turn.phase = "completed";
    unknownWinner.winnerId = asPlayerId("missing");
    expectCode(unknownWinner, "INVARIANT_VIOLATION");
  });

  it("validates clock durations, player keys, timestamps, and completion", () => {
    const legacy = game();
    delete legacy.clock;
    expect(validateGameState(legacy)).toEqual([]);

    for (const duration of [-1, 1.5]) {
      const invalid = game();
      invalid.clock!.totalActiveMs = duration;
      expectCode(invalid, "INVALID_CLOCK_STATE");
    }

    const missingPlayer = game();
    delete missingPlayer.clock!.playerActiveMs[PLAYER_IDS[0]!];
    expectCode(missingPlayer, "INVALID_CLOCK_STATE");

    const extraPlayer = game();
    extraPlayer.clock!.playerActiveMs[asPlayerId("extra")] = 0;
    expectCode(extraPlayer, "INVALID_CLOCK_STATE");

    const stoppedActive = game();
    stoppedActive.clock!.runningSince = null;
    expectCode(stoppedActive, "INVALID_CLOCK_STATE");

    const runningAndPaused = game();
    runningAndPaused.clock!.pausedAt = asIsoTimestamp("2026-07-12T00:01:00Z");
    expectCode(runningAndPaused, "INVALID_CLOCK_STATE");

    const malformedTimestamp = game();
    malformedTimestamp.clock!.runningSince = asIsoTimestamp("invalid");
    expectCode(malformedTimestamp, "INVALID_CLOCK_STATE");

    const completed = game();
    completed.status = "completed";
    completed.turn.phase = "completed";
    completed.winnerId = PLAYER_IDS[0]!;
    expectCode(completed, "INVALID_CLOCK_STATE");
    completed.clock!.runningSince = null;
    expect(validateGameState(completed)).toEqual([]);
  });
});

describe("runtime validators", () => {
  it("recognizes event faces and disciplines", () => {
    expect(isEventFace("barbarian")).toBe(true);
    expect(isEventFace("science")).toBe(true);
    expect(isEventFace("unknown")).toBe(false);
    expect(isDiscipline("trade")).toBe(true);
    expect(isDiscipline("unknown")).toBe(false);
  });

  it.each([
    [{ trigger: true }, true],
    [{ trigger: false }, true],
    [{ trigger: "yes" }, false],
    [{}, false],
    [null, false],
    ["trigger", false],
  ])("validates trigger token %j", (value, expected) => {
    expect(isTriggerToken(value)).toBe(expected);
  });
});
