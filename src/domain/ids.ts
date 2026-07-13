import type {
  CommandId,
  EventId,
  EventOccurrenceId,
  GameId,
  IsoTimestamp,
  PlayerId,
  ProposalId,
  RevisionId,
  RollId,
  ScoreEntryId,
} from "./types";

export const asGameId = (value: string): GameId => value as GameId;
export const asPlayerId = (value: string): PlayerId => value as PlayerId;
export const asRevisionId = (value: string): RevisionId => value as RevisionId;
export const asRollId = (value: string): RollId => value as RollId;
export const asEventId = (value: string): EventId => value as EventId;
export const asEventOccurrenceId = (value: string): EventOccurrenceId =>
  value as EventOccurrenceId;
export const asProposalId = (value: string): ProposalId => value as ProposalId;
export const asScoreEntryId = (value: string): ScoreEntryId =>
  value as ScoreEntryId;
export const asCommandId = (value: string): CommandId => value as CommandId;
export const asIsoTimestamp = (value: string): IsoTimestamp =>
  value as IsoTimestamp;
