/**
 * Coverage for defensive branches in the core domain helpers.
 *
 * These paths are reachable but rarely exercised by the gameplay-level tests:
 * timestamp parsing rejects malformed calendar values, clock accrual guards a
 * missing current player, and barbarian attack resolution has to pick between
 * a sole defender, a tie, and several pillage shapes.
 */
import { describe, expect, it } from "vitest";
import { elapsedActiveMilliseconds, parseIsoTimestamp } from "./clock";
import {
  asIsoTimestamp,
  asPlayerId,
  asProposalId,
  calculateBarbarianAttack,
  firstFailure,
} from "./index";
import type { GameState, PlayerId, PlayerState } from "./types";

const AT = asIsoTimestamp("2026-07-25T10:00:00.000Z");

describe("parseIsoTimestamp calendar validation", () => {
  it("accepts UTC and explicit offsets", () => {
    expect(parseIsoTimestamp(asIsoTimestamp("2026-07-25T10:00:00Z"))).toBe(
      Date.parse("2026-07-25T10:00:00Z"),
    );
    // The offset branch parses hour/minute instead of short-circuiting to zero.
    expect(parseIsoTimestamp(asIsoTimestamp("2026-07-25T12:00:00+02:00"))).toBe(
      Date.parse("2026-07-25T12:00:00+02:00"),
    );
    expect(parseIsoTimestamp(asIsoTimestamp("2026-07-25T08:00:00-02:00"))).toBe(
      Date.parse("2026-07-25T08:00:00-02:00"),
    );
  });

  it("rejects structurally malformed timestamps", () => {
    expect(parseIsoTimestamp(asIsoTimestamp("not-a-timestamp"))).toBeNull();
    expect(parseIsoTimestamp(asIsoTimestamp(""))).toBeNull();
    // Missing zone designator: the pattern requires Z or an explicit offset.
    expect(parseIsoTimestamp(asIsoTimestamp("2026-07-25T10:00:00"))).toBeNull();
  });

  it("rejects out-of-range calendar and clock fields", () => {
    const invalid = [
      "2026-00-10T10:00:00Z", // month < 1
      "2026-13-10T10:00:00Z", // month > 12
      "2026-07-00T10:00:00Z", // day < 1
      "2026-07-32T10:00:00Z", // day > days in month
      "2026-07-25T24:00:00Z", // hour > 23
      "2026-07-25T10:60:00Z", // minute > 59
      "2026-07-25T10:00:60Z", // second > 59
      "2026-07-25T10:00:00+24:00", // offset hour > 23
      "2026-07-25T10:00:00+02:60", // offset minute > 59
    ];
    for (const timestamp of invalid) {
      expect(parseIsoTimestamp(asIsoTimestamp(timestamp))).toBeNull();
    }
  });

  it("applies leap-year rules to February", () => {
    // 2024 is a leap year, 2026 is not; 2000 is (400), 1900 is not (100).
    expect(
      parseIsoTimestamp(asIsoTimestamp("2024-02-29T00:00:00Z")),
    ).not.toBeNull();
    expect(
      parseIsoTimestamp(asIsoTimestamp("2026-02-29T00:00:00Z")),
    ).toBeNull();
    expect(
      parseIsoTimestamp(asIsoTimestamp("2000-02-29T00:00:00Z")),
    ).not.toBeNull();
    expect(
      parseIsoTimestamp(asIsoTimestamp("1900-02-29T00:00:00Z")),
    ).toBeNull();
  });

  it("knows which months are short", () => {
    // April, June, September and November have 30 days; the rest have 31.
    for (const month of ["04", "06", "09", "11"]) {
      expect(
        parseIsoTimestamp(asIsoTimestamp(`2026-${month}-30T00:00:00Z`)),
      ).not.toBeNull();
      expect(
        parseIsoTimestamp(asIsoTimestamp(`2026-${month}-31T00:00:00Z`)),
      ).toBeNull();
    }
    expect(
      parseIsoTimestamp(asIsoTimestamp("2026-01-31T00:00:00Z")),
    ).not.toBeNull();
  });
});

describe("elapsedActiveMilliseconds", () => {
  it("returns null when either endpoint is unparseable", () => {
    expect(elapsedActiveMilliseconds(asIsoTimestamp("nope"), AT)).toBeNull();
    expect(elapsedActiveMilliseconds(AT, asIsoTimestamp("nope"))).toBeNull();
  });

  it("never reports negative elapsed time", () => {
    const later = asIsoTimestamp("2026-07-25T10:00:05.000Z");
    expect(elapsedActiveMilliseconds(AT, later)).toBe(5_000);
    // A clock that moved backwards clamps to zero rather than subtracting time.
    expect(elapsedActiveMilliseconds(later, AT)).toBe(0);
  });
});

describe("firstFailure", () => {
  it("succeeds on an empty error list and reports the first error otherwise", () => {
    expect(firstFailure([])).toMatchObject({ ok: true });
    const result = firstFailure([
      { code: "INVALID_SETUP", message: "first", details: {} },
      { code: "INVALID_COMMAND", message: "second", details: {} },
    ]);
    expect(result).toMatchObject({ ok: false, error: { message: "first" } });
  });
});

describe("calculateBarbarianAttack", () => {
  const IDS = [
    asPlayerId("barb-a"),
    asPlayerId("barb-b"),
    asPlayerId("barb-c"),
  ] as const;

  function player(
    id: PlayerId,
    order: number,
    knights: { basic?: number; strong?: number; mighty?: number },
    ordinaryCities: number,
  ): PlayerState {
    return {
      id,
      name: id,
      color: {
        id: `color-${order}`,
        label: `Color ${order}`,
        hex: "#000000",
        distinguishabilityKey: `key-${order}`,
      },
      order,
      ordinaryCities,
      activeKnights: {
        basic: knights.basic ?? 0,
        strong: knights.strong ?? 0,
        mighty: knights.mighty ?? 0,
      },
      inactiveKnights: { basic: 0, strong: 0, mighty: 0 },
      cityWalls: 0,
      improvements: { science: 0, trade: 0, politics: 0 },
    };
  }

  function state(
    players: PlayerState[],
    options: { currentPlayerIndex?: number; attacksCompleted?: number } = {},
  ): Pick<GameState, "players" | "metropolises" | "barbarian" | "turn"> {
    return {
      players,
      metropolises: {
        controls: { science: null, trade: null, politics: null },
        pendingProposal: null,
      },
      barbarian: {
        shipPosition: 0,
        robberActivated: false,
        attacksCompleted: options.attacksCompleted ?? 0,
        rules: { trackLength: 7, knightComponentLimitPerLevel: 2 },
        pendingAttack: null,
        history: [],
      },
      turn: {
        phase: "resolving-barbarian-attack",
        currentPlayerIndex: options.currentPlayerIndex ?? 0,
        round: 1,
        turnNumber: 1,
        completedTurns: 0,
      },
    };
  }

  it("awards a Defender point to a sole top contributor", () => {
    const proposal = calculateBarbarianAttack(
      state([
        player(IDS[0], 0, { mighty: 2 }, 2),
        player(IDS[1], 1, {}, 2),
        player(IDS[2], 2, {}, 2),
      ]),
      asProposalId("sole-defender"),
    );

    expect(proposal.outcome).toEqual({
      type: "defenders-win",
      reward: { type: "defender-point", playerId: IDS[0] },
    });
    expect(proposal.summary).toContain("sole top contributor");
    // No attack has happened yet, so this is the first one.
    expect(proposal.firstAttack).toBe(true);
  });

  it("offers progress choices to tied top contributors in turn order", () => {
    const proposal = calculateBarbarianAttack(
      state(
        [
          // Barbarian strength equals the total city count (6 here), so the
          // defenders need at least that much knight strength to hold.
          player(IDS[0], 0, { mighty: 1 }, 2),
          player(IDS[1], 1, { mighty: 1 }, 2),
          player(IDS[2], 2, {}, 2),
        ],
        { currentPlayerIndex: 1, attacksCompleted: 2 },
      ),
      asProposalId("tied-defenders"),
    );

    expect(proposal.strengths.defenders).toBeGreaterThanOrEqual(
      proposal.strengths.barbarian,
    );
    expect(proposal.outcome.type).toBe("defenders-win");
    if (proposal.outcome.type !== "defenders-win") return;
    expect(proposal.outcome.reward.type).toBe("progress-choice");
    if (proposal.outcome.reward.type !== "progress-choice") return;
    // Ordering starts at the current player and wraps around the table.
    expect(proposal.outcome.reward.playerIds).toEqual([IDS[1], IDS[0]]);
    expect(proposal.summary).toContain("tied top contributors");
    expect(proposal.firstAttack).toBe(false);
  });

  it("pillages the weakest group that still has an ordinary city", () => {
    const proposal = calculateBarbarianAttack(
      state([
        // Three cities means barbarian strength 3, above the two knights below.
        // The first player is weakest but has no city left to lose.
        player(IDS[0], 0, {}, 0),
        player(IDS[1], 1, { basic: 1 }, 1),
        player(IDS[2], 2, { basic: 1 }, 2),
      ]),
      asProposalId("pillage-next-group"),
    );

    expect(proposal.strengths.defenders).toBeLessThan(
      proposal.strengths.barbarian,
    );
    expect(proposal.outcome.type).toBe("barbarians-win");
    if (proposal.outcome.type !== "barbarians-win") return;
    // The empty-handed player is skipped in favour of the next weakest group.
    expect(proposal.outcome.pillagedPlayerIds).toEqual([IDS[1], IDS[2]]);
    expect(proposal.summary).toContain("lowest vulnerable strength group");
  });

  it("reports a win with nothing to pillage when no city is exposed", () => {
    const proposal = calculateBarbarianAttack(
      state([
        // One metropolis-free city keeps the barbarians ahead of zero knights.
        player(IDS[0], 0, {}, 0),
        player(IDS[1], 1, {}, 0),
        player(IDS[2], 2, {}, 1),
      ]),
      asProposalId("nothing-to-pillage"),
    );

    expect(proposal.outcome.type).toBe("barbarians-win");
    if (proposal.outcome.type !== "barbarians-win") return;
    // Only the single city-holding player is vulnerable.
    expect(proposal.outcome.pillagedPlayerIds).toEqual([IDS[2]]);
  });

  it("reports a win with an empty pillage list when the table has no cities", () => {
    const proposal = calculateBarbarianAttack(
      state([
        player(IDS[0], 0, {}, 0),
        player(IDS[1], 1, {}, 0),
        player(IDS[2], 2, {}, 0),
      ]),
      asProposalId("no-cities"),
    );

    // Zero cities means zero barbarian strength, which the defenders match.
    expect(proposal.strengths.barbarian).toBe(0);
    expect(proposal.outcome.type).toBe("defenders-win");
  });
});
