export type PersistenceErrorCode =
  | "NOT_FOUND"
  | "REVISION_CONFLICT"
  | "CORRUPT_GAME"
  | "INVALID_IMPORT"
  | "UNSUPPORTED_VERSION"
  | "INTEGRITY_FAILURE"
  | "IMPORT_TOO_LARGE"
  | "INVALID_BOARD_DESIGN"
  | "STORAGE_UNAVAILABLE"
  | "TRANSACTION_FAILED";

export class PersistenceError extends Error {
  readonly name = "PersistenceError";

  constructor(
    readonly code: PersistenceErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number | null>> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

export function persistenceError(
  code: PersistenceErrorCode,
  message: string,
  details: Readonly<Record<string, string | number | null>> = {},
  cause?: unknown,
): PersistenceError {
  return new PersistenceError(code, message, details, { cause });
}
