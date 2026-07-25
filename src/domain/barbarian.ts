import {
  activeKnightStrength,
  barbarianStrength,
  potentialKnightStrength,
} from "./selectors";
import type {
  BarbarianAttackOutcome,
  BarbarianAttackProposal,
  BarbarianAttackStrengths,
  GameState,
  PlayerId,
  ProposalId,
} from "./types";

/**
 * What would happen if the barbarians landed right now.
 *
 * The pillage cascade — barbarians strike the weakest knight group that still
 * owns an ordinary city, skipping groups with nothing left to lose — is the
 * most misplayed moment in Cities & Knights. This runs the real resolution
 * ahead of time so the table can see the consequence before it happens.
 */
export interface BarbarianForecast {
  strengths: BarbarianAttackStrengths;
  outcome: BarbarianAttackOutcome;
  summary: string;
  /** Advances still needed before the ship reaches Catan. */
  advancesUntilAttack: number;
  /** True when the next barbarian face triggers the attack. */
  attackImminent: boolean;
  /** Defence the table is giving up by leaving knights inactive. */
  inactiveStrength: number;
  /** Players who would lose an ordinary city if the attack resolved now. */
  pillagedPlayerIds: readonly PlayerId[];
}

const FORECAST_PROPOSAL_ID = "forecast" as ProposalId;

export function forecastBarbarianAttack(
  state: Pick<GameState, "players" | "metropolises" | "barbarian" | "turn">,
): BarbarianForecast {
  // Reuse the real resolution so the forecast can never drift from what
  // actually happens when the ship lands.
  const proposal = calculateBarbarianAttack(state, FORECAST_PROPOSAL_ID);
  const potential = state.players.reduce(
    (total, player) => total + potentialKnightStrength(player),
    0,
  );
  const advancesUntilAttack = Math.max(
    0,
    state.barbarian.rules.trackLength - state.barbarian.shipPosition,
  );

  return {
    strengths: proposal.strengths,
    outcome: proposal.outcome,
    summary: proposal.summary,
    advancesUntilAttack,
    attackImminent: advancesUntilAttack <= 1,
    inactiveStrength: potential - proposal.strengths.defenders,
    pillagedPlayerIds:
      proposal.outcome.type === "barbarians-win"
        ? proposal.outcome.pillagedPlayerIds
        : [],
  };
}

export function calculateBarbarianAttack(
  state: Pick<GameState, "players" | "metropolises" | "barbarian" | "turn">,
  proposalId: ProposalId,
): BarbarianAttackProposal {
  const contributions = state.players.map((player) => ({
    playerId: player.id,
    strength: activeKnightStrength(player),
  }));
  const strengths: BarbarianAttackStrengths = {
    barbarian: barbarianStrength(state),
    defenders: contributions.reduce(
      (total, contribution) => total + contribution.strength,
      0,
    ),
    contributions,
  };

  if (strengths.defenders >= strengths.barbarian) {
    const maximum = Math.max(
      ...contributions.map((contribution) => contribution.strength),
    );
    const topPlayerIds = contributions
      .filter((contribution) => contribution.strength === maximum)
      .map((contribution) => contribution.playerId);
    const reward =
      topPlayerIds.length === 1
        ? ({
            type: "defender-point",
            playerId: topPlayerIds[0] as PlayerId,
          } as const)
        : ({
            type: "progress-choice",
            playerIds: inCurrentPlayerOrder(
              topPlayerIds,
              state.players.map((player) => player.id),
              state.turn.currentPlayerIndex,
            ),
          } as const);
    return {
      id: proposalId,
      strengths,
      firstAttack: state.barbarian.attacksCompleted === 0,
      outcome: { type: "defenders-win", reward },
      summary:
        reward.type === "defender-point"
          ? "The defenders win; the sole top contributor gains one Defender point."
          : "The defenders win; tied top contributors each choose a progress deck.",
    };
  }

  const strengthGroups = [
    ...new Set(contributions.map((item) => item.strength)),
  ]
    .sort((left, right) => left - right)
    .map((strength) =>
      contributions.filter((item) => item.strength === strength),
    );
  let pillagedPlayerIds: PlayerId[] = [];
  for (const group of strengthGroups) {
    const vulnerable = group
      .map((item) => item.playerId)
      .filter(
        (playerId) =>
          state.players.find((player) => player.id === playerId)
            ?.ordinaryCities !== 0,
      );
    if (vulnerable.length > 0) {
      pillagedPlayerIds = vulnerable;
      break;
    }
  }

  return {
    id: proposalId,
    strengths,
    firstAttack: state.barbarian.attacksCompleted === 0,
    outcome: { type: "barbarians-win", pillagedPlayerIds },
    summary:
      pillagedPlayerIds.length === 0
        ? "The barbarians win, but no recorded ordinary city is vulnerable."
        : "The barbarians win; the lowest vulnerable strength group loses one ordinary city each.",
  };
}

function inCurrentPlayerOrder(
  selected: readonly PlayerId[],
  playerOrder: readonly PlayerId[],
  currentPlayerIndex: number,
): PlayerId[] {
  return playerOrder
    .map(
      (_, offset) =>
        playerOrder[(currentPlayerIndex + offset) % playerOrder.length],
    )
    .filter(
      (playerId): playerId is PlayerId =>
        playerId !== undefined && selected.includes(playerId),
    );
}
