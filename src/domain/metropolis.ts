import { domainError, failure, success } from "./errors";
import { scoreForPlayer } from "./selectors";
import type {
  DomainResult,
  GameState,
  MetropolisChange,
  MetropolisControl,
  MetropolisDiscipline,
  MetropolisProposal,
  ProposalId,
} from "./types";

export function proposeMetropolisChange(
  state: Pick<GameState, "players" | "metropolises" | "scoreLedger">,
  proposalId: ProposalId,
  discipline: MetropolisDiscipline,
  to: MetropolisControl,
  source: MetropolisProposal["source"],
): DomainResult<MetropolisProposal> {
  if (state.metropolises.pendingProposal !== null) {
    return failure(
      domainError(
        "INVALID_METROPOLIS_STATE",
        "Another metropolis proposal is already pending.",
      ),
    );
  }
  const from = state.metropolises.controls[discipline];
  if (sameControl(from, to)) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "The proposed metropolis control is unchanged.",
      ),
    );
  }
  if (from?.status === "permanent" && source !== "correction") {
    return failure(
      domainError(
        "INVALID_METROPOLIS_STATE",
        "Permanent metropolis control cannot transfer.",
        { discipline },
      ),
    );
  }
  const targetError = validateTarget(state, discipline, to);
  if (targetError !== null) {
    return failure(targetError);
  }

  const changes = buildChanges(state, from, to);
  for (const change of changes) {
    const player = state.players.find(
      (candidate) => candidate.id === change.playerId,
    );
    if (player === undefined) {
      return failure(
        domainError(
          "INVALID_METROPOLIS_STATE",
          "A metropolis change references an unknown player.",
          { playerId: change.playerId, discipline },
        ),
      );
    }
  }

  return success({
    id: proposalId,
    discipline,
    source,
    from,
    to,
    changes,
    summary: describeChange(discipline, from, to),
  });
}

/**
 * Whether the target is a legal holder.
 *
 * Corrections skip the improvement-level rule. A correction is the operator
 * telling the app that the physical board disagrees with it, so checking the
 * app's own (known-wrong) level first would block the very repair the command
 * exists for.
 *
 * This is only safe because the control now records its `source`, and
 * `validateMetropolises` skips the same rule for corrected controls. Relaxing
 * it here alone would let the proposal through and then fail the confirmation
 * on final state, stranding a pending proposal that blocks the turn.
 */
function validateTarget(
  state: Pick<GameState, "players">,
  discipline: MetropolisDiscipline,
  target: MetropolisControl,
) {
  if (target === null) {
    return null;
  }
  const player = state.players.find(
    (candidate) => candidate.id === target.holderId,
  );
  if (player === undefined) {
    return domainError(
      "INVALID_METROPOLIS_STATE",
      "Metropolis holder does not exist.",
      { holderId: target.holderId },
    );
  }
  if (target.source === "correction") {
    return null;
  }
  const minimum = target.status === "permanent" ? 5 : 4;
  if (player.improvements[discipline] < minimum) {
    return domainError(
      "INVALID_METROPOLIS_STATE",
      "Metropolis holder has not reached the required improvement level.",
      {
        holderId: target.holderId,
        discipline,
        requiredLevel: minimum,
      },
    );
  }
  return null;
}

/**
 * The public points a metropolis moves.
 *
 * The outgoing holder normally gives back the two points the metropolis was
 * worth. That subtraction is clamped at the holder's current score, because a
 * public score can never go negative and rejecting the whole transfer would be
 * worse: the physical board has already moved the metropolis, and refusing to
 * record it would leave the app permanently disagreeing with the table, with no
 * way back. A holder can end up below two points through ordinary corrections,
 * so this is reachable in a normal game.
 */
function buildChanges(
  state: Pick<GameState, "scoreLedger">,
  from: MetropolisControl,
  to: MetropolisControl,
): MetropolisChange[] {
  if (from?.holderId === to?.holderId) {
    return [];
  }
  const changes: MetropolisChange[] = [];
  if (from !== null) {
    const available = scoreForPlayer(state, from.holderId);
    const scoreDelta = -Math.min(2, Math.max(0, available));
    if (scoreDelta !== 0) {
      changes.push({ playerId: from.holderId, scoreDelta });
    }
  }
  if (to !== null) {
    changes.push({
      playerId: to.holderId,
      scoreDelta: 2,
    });
  }
  return changes;
}

function sameControl(
  left: MetropolisControl,
  right: MetropolisControl,
): boolean {
  return left?.holderId === right?.holderId && left?.status === right?.status;
}

function describeChange(
  discipline: MetropolisDiscipline,
  from: MetropolisControl,
  to: MetropolisControl,
): string {
  if (from === null && to !== null) {
    return `Assign the ${discipline} metropolis as ${to.status}.`;
  }
  if (from !== null && to === null) {
    return `Remove the ${discipline} metropolis from its recorded holder.`;
  }
  if (from?.holderId === to?.holderId) {
    return `Make the ${discipline} metropolis permanent.`;
  }
  return `Transfer the ${discipline} metropolis and its two public points.`;
}
