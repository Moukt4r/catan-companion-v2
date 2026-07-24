import { describe, expect, it } from "vitest";
import {
  BUILT_IN_THEMATIC_EVENTS,
  asEventOccurrenceId,
  asGameId,
  asIsoTimestamp,
  asPlayerId,
  asProposalId,
  asRevisionId,
  asRollId,
  asScoreEntryId,
  createGame,
  type BarbarianAttackProposal,
  type GameState,
  type IdSource,
} from "../../../domain";
import {
  toBarbarianAttackView,
  toEligibleProgressPlayers,
  toGameCompleteView,
  toGameTableView,
  toPlayerEditorValue,
  toRollResolutionView,
} from "./viewMappers";

const ADA = asPlayerId("ada");
const GRACE = asPlayerId("grace");
const LINUS = asPlayerId("linus");

function idSource(): IdSource {
  let next = 0;
  return {
    next(kind) {
      next += 1;
      return `mapper-${kind}-${next}`;
    },
  };
}

function game(): GameState {
  const result = createGame({
    gameId: asGameId("mapper-game"),
    revisionId: asRevisionId("mapper-revision"),
    createdAt: asIsoTimestamp("2026-07-12T12:00:00.000Z"),
    setup: {
      title: "Mapper table",
      mode: "standard",
      players: [
        {
          id: ADA,
          name: "Ada",
          color: {
            id: "blue",
            label: "Blue",
            hex: "#123456",
            distinguishabilityKey: "blue",
          },
          ordinaryCities: 2,
          activeKnights: { basic: 1, strong: 1, mighty: 0 },
          improvements: { science: 3, trade: 2, politics: 1 },
        },
        {
          id: GRACE,
          name: "Grace",
          color: {
            id: "red",
            label: "Red",
            hex: "#654321",
            distinguishabilityKey: "red",
          },
          ordinaryCities: 1,
          activeKnights: { basic: 0, strong: 0, mighty: 1 },
          improvements: { science: 1, trade: 4, politics: 2 },
        },
        {
          id: LINUS,
          name: "Linus",
          color: {
            id: "green",
            label: "Green",
            hex: "#117744",
            distinguishabilityKey: "green",
          },
        },
      ],
      firstPlayerId: ADA,
      victoryTarget: 13,
      thematicCadence: "standard",
      thematicEventsEnabled: true,
      thematicEventCatalog: BUILT_IN_THEMATIC_EVENTS.map((event) => ({
        ...event,
      })),
      rulesDataVersion: "2025.1",
      gameDocumentVersion: 1,
    },
    random: () => 0,
    ids: idSource(),
  });
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value.nextState;
}

function lastRoll(): NonNullable<GameState["lastRoll"]> {
  return {
    id: asRollId("mapper-roll"),
    playerId: ADA,
    turnNumber: 2,
    round: 1,
    numbered: { red: 3, yellow: 4 },
    total: 7,
    eventFace: "science",
    alchemy: true,
    numberedDeckCycle: 0,
    numberedDeckIndex: null,
    eventDeckCycle: 0,
    eventDeckIndex: 1,
    progress: {
      discipline: "science",
      eligiblePlayerIds: [ADA, asPlayerId("missing")],
      red: 3,
    },
    production: {
      type: "seven",
      robberActive: false,
      reminder: "robber-not-yet-active",
    },
    thematicEventOccurrenceId: asEventOccurrenceId("occurrence"),
    createdAt: asIsoTimestamp("2026-07-12T12:05:00.000Z"),
  };
}

describe("toGameTableView", () => {
  it("maps public table controls, scores, strength, and read-only state", () => {
    const state = game();
    const view = toGameTableView(
      state,
      { savedLabel: "Saving", saveTone: "warning" },
      true,
      true,
      true,
    );

    expect(view).toMatchObject({
      title: "Mapper table",
      phaseLabel: "Awaiting roll",
      currentPlayerName: "Ada",
      nextPlayerName: "Grace",
      savedLabel: "Saving",
      saveTone: "warning",
      offline: true,
      readOnly: true,
      paused: false,
      canRoll: true,
      canContinueRoll: false,
      showNextRoll: false,
      canRollNextTurn: false,
      canEditPublicState: false,
      canPause: true,
      currentTurnMs: 0,
      totalGameMs: 0,
      rolling: true,
      lastRoll: null,
      numberedCycleProgress: "0 / 36",
      barbarian: {
        position: 0,
        trackLength: 7,
        strength: 4,
        defenderStrength: 6,
        attackPending: false,
      },
      worldEventPending: false,
      worldEvent: null,
      activeEvents: [],
    });
    expect(view.players[0]).toMatchObject({
      name: "Ada",
      victoryPoints: 3,
      activeTimeMs: 0,
      current: true,
    });
  });

  it("maps an Alchemy roll, metropolis ownership, and winner candidate", () => {
    const base = game();
    const state: GameState = {
      ...base,
      turn: { ...base.turn, phase: "action-phase" },
      lastRoll: lastRoll(),
      metropolises: {
        ...base.metropolises,
        controls: {
          ...base.metropolises.controls,
          science: { holderId: ADA, status: "temporary" },
        },
      },
      scoreLedger: [
        ...base.scoreLedger,
        {
          id: asScoreEntryId("winner-score"),
          playerId: ADA,
          delta: 10,
          reason: "manual",
          createdAt: asIsoTimestamp("2026-07-12T12:05:00.000Z"),
        },
      ],
    };

    const view = toGameTableView(state, {
      savedLabel: "Saved",
      saveTone: "success",
    });

    expect(view.showNextRoll).toBe(true);
    expect(view.canRollNextTurn).toBe(true);
    expect(view.canEditPublicState).toBe(true);
    expect(view.lastRoll).toEqual({
      red: 3,
      yellow: 4,
      event: "science",
      total: 7,
      source: "alchemy",
      progress: {
        discipline: "science",
        redValue: 3,
        eligiblePlayers: [{ id: ADA, name: "Ada" }],
      },
      production: {
        robberActivated: false,
      },
    });
    expect(view.winnerCandidateName).toBe("Ada");

    const pending = toGameTableView(
      {
        ...state,
        metropolises: {
          ...state.metropolises,
          pendingProposal: {
            id: asProposalId("pending"),
            discipline: "trade",
            source: "improvement",
            from: null,
            to: { holderId: GRACE, status: "temporary" },
            changes: [],
            summary: "Pending",
          },
        },
      },
      { savedLabel: "Saved", saveTone: "success" },
    );
    expect(pending.showNextRoll).toBe(true);
    expect(pending.canRollNextTurn).toBe(false);
    expect(pending.canEditPublicState).toBe(false);
  });
});

describe("other view mappers", () => {
  it("maps player editing and rejects an unknown player", () => {
    const base = game();
    const state: GameState = {
      ...base,
      metropolises: {
        ...base.metropolises,
        controls: {
          ...base.metropolises.controls,
          science: { holderId: ADA, status: "temporary" },
        },
      },
    };

    expect(toPlayerEditorValue(state, ADA)).toMatchObject({
      id: ADA,
      name: "Ada",
      victoryPoints: 3,
      ordinaryCities: 2,
      activeKnights: { basic: 1, strong: 1, mighty: 0 },
      improvements: { science: 3, trade: 2, politics: 1 },
      metropolisDisciplines: ["science"],
    });
    expect(() => toPlayerEditorValue(state, asPlayerId("unknown"))).toThrow(
      "Player does not exist.",
    );
  });

  it("maps eligible progress players and skips stale ids", () => {
    const state: GameState = { ...game(), lastRoll: lastRoll() };
    expect(toEligibleProgressPlayers(state, "science")).toEqual([
      {
        id: ADA,
        name: "Ada",
        color: "#123456",
        level: 3,
        eligibleRange: "1, 2, 3, 4",
      },
    ]);
    expect(
      toEligibleProgressPlayers({ ...state, lastRoll: null }, "science"),
    ).toEqual([]);
  });

  it("combines roll, progress, production, event, and next-player information", () => {
    const event = BUILT_IN_THEMATIC_EVENTS[0]!;
    const state: GameState = {
      ...game(),
      lastRoll: lastRoll(),
      thematicEvents: {
        ...game().thematicEvents,
        pendingEvent: {
          occurrenceId: asEventOccurrenceId("occurrence"),
          eventId: event.id,
          contentVersion: event.contentVersion,
          title: event.title,
          instruction: event.instruction,
          triggeredAtCompletedTurn: 3,
          acknowledged: false,
        },
      },
    };

    expect(toRollResolutionView(state)).toMatchObject({
      currentPlayerName: "Ada",
      nextPlayerName: "Grace",
      currentTurnMs: 0,
      totalGameMs: 0,
      roll: {
        total: 7,
        event: "science",
        source: "alchemy",
      },
      progress: {
        discipline: "science",
        eligiblePlayers: [{ id: ADA, name: "Ada" }],
      },
      production: {
        total: 7,
        robberActivated: false,
      },
      attack: null,
    });
  });

  it("rejects states without a valid rolling player", () => {
    expect(() => toRollResolutionView(game())).toThrow(
      "A roll result is required.",
    );
    const state = { ...game(), lastRoll: lastRoll(), players: [] };
    expect(() => toRollResolutionView(state)).toThrow(
      "The rolling player does not exist.",
    );
  });

  it("maps defender rewards and barbarian pillaging", () => {
    const state = game();
    const defendersWin: BarbarianAttackProposal = {
      id: asProposalId("defenders-win"),
      strengths: {
        barbarian: 3,
        defenders: 6,
        contributions: [
          { playerId: ADA, strength: 3 },
          { playerId: GRACE, strength: 3 },
        ],
      },
      outcome: {
        type: "defenders-win",
        reward: { type: "progress-choice", playerIds: [ADA, GRACE] },
      },
      firstAttack: true,
      summary: "Defenders win",
    };
    expect(toBarbarianAttackView(state, defendersWin)).toMatchObject({
      proposalId: defendersWin.id,
      outcome: "defenders-win",
      uniqueDefenderId: null,
      tiedDefenderIds: [ADA, GRACE],
      pillagedPlayerIds: [],
      firstAttack: true,
    });
    expect(toBarbarianAttackView(state, defendersWin).players[0]).toMatchObject(
      {
        activeKnights: "1 basic, 1 strong",
        activeStrength: 3,
      },
    );

    const barbariansWin: BarbarianAttackProposal = {
      ...defendersWin,
      id: asProposalId("barbarians-win"),
      outcome: { type: "barbarians-win", pillagedPlayerIds: [GRACE] },
      firstAttack: false,
    };
    expect(toBarbarianAttackView(state, barbariansWin)).toMatchObject({
      outcome: "barbarians-win",
      tiedDefenderIds: [],
      pillagedPlayerIds: [GRACE],
    });
  });

  it("maps completed-game statistics and requires a winner", () => {
    const base = game();
    expect(() => toGameCompleteView(base)).toThrow(
      "Completed game has no winner.",
    );

    const state: GameState = {
      ...base,
      status: "completed",
      winnerId: GRACE,
      updatedAt: asIsoTimestamp("2026-07-12T13:35:00.000Z"),
      turn: { ...base.turn, phase: "completed", round: 8 },
      statistics: {
        ...base.statistics,
        completedTurns: 24,
        totalRolls: 22,
        thematicEventsTriggered: 2,
      },
      barbarian: { ...base.barbarian, attacksCompleted: 3 },
    };
    const completed = toGameCompleteView(state);
    expect(completed).toMatchObject({
      title: "Mapper table",
      winnerName: "Grace",
      winnerColor: "#654321",
      rounds: 8,
      turns: 24,
      totalGameMs: 5_700_000,
      rolls: 22,
      barbarianAttacks: 3,
      thematicEvents: 2,
    });
    expect(completed.players[0]).toMatchObject({
      id: ADA,
      activeTimeMs: 5_700_000,
    });
    expect(completed.players[1]).toMatchObject({
      id: GRACE,
      activeTimeMs: 0,
    });
  });
});

describe("season view mapping", () => {
  const saveLabel = {
    savedLabel: "Saved" as const,
    saveTone: "success" as const,
  };
  it("returns null season when seasonConfig is absent", () => {
    const state = game();
    const view = toGameTableView(state, saveLabel);
    expect(view.season).toBeNull();
  });

  it("returns null season when seasonConfig.enabled is false", () => {
    const state = game();
    state.setup.seasonConfig = {
      enabled: false,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    const view = toGameTableView(state, saveLabel);
    expect(view.season).toBeNull();
  });

  it("returns season info when enabled", () => {
    const state = game();
    state.setup.seasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    state.turn.round = 4; // summer
    const view = toGameTableView(state, saveLabel);
    expect(view.season).toMatchObject({
      current: "summer",
      label: "Summer",
      icon: "☀️",
      roundInSeason: 1,
      roundsPerSeason: 3,
    });
  });

  it("detects season transition", () => {
    const state = game();
    state.setup.seasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    state.turn.round = 4; // first round of summer
    const view = toGameTableView(state, saveLabel);
    expect(view.season?.transitioned).toBe(true);
  });

  it("keeps the transition for the first player's turn, then hides it", () => {
    const state = game();
    state.setup.seasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    state.turn.round = 4;
    state.turn.phase = "action-phase";
    expect(toGameTableView(state, saveLabel).season?.transitioned).toBe(true);

    state.turn.phase = "awaiting-roll";
    state.turn.currentPlayerIndex = 1;
    expect(toGameTableView(state, saveLabel).season?.transitioned).toBe(false);
  });

  it("no transition within season", () => {
    const state = game();
    state.setup.seasonConfig = {
      enabled: true,
      roundsPerSeason: 3,
      startingSeason: "spring",
    };
    state.turn.round = 2; // still spring
    const view = toGameTableView(state, saveLabel);
    expect(view.season?.transitioned).toBe(false);
  });
});
