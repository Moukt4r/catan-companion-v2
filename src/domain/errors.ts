import type { DomainError, DomainErrorCode, DomainResult } from "./types";

export function domainError(
  code: DomainErrorCode,
  message: string,
  details: DomainError["details"] = {},
): DomainError {
  return { code, message, details };
}

export function success<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function failure<T>(error: DomainError): DomainResult<T> {
  return { ok: false, error };
}

export function firstFailure(errors: DomainError[]): DomainResult<undefined> {
  return errors.length === 0
    ? success(undefined)
    : failure(
        errors[0] ??
          domainError("INVARIANT_VIOLATION", "Unknown invariant failure."),
      );
}
