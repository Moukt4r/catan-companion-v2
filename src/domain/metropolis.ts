import { domainError, failure, success } from "./errors";
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
  state: Pick<GameState, "players" | "metropolises">,
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

  const changes = buildChanges(from, to);
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

function buildChanges(
  from: MetropolisControl,
  to: MetropolisControl,
): MetropolisChange[] {
  if (from?.holderId === to?.holderId) {
    return [];
  }
  const changes: MetropolisChange[] = [];
  if (from !== null) {
    changes.push({
      playerId: from.holderId,
      scoreDelta: -2,
    });
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
