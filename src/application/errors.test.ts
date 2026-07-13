import { describe, expect, it } from "vitest";
import {
  isPersistenceError,
  PersistenceError,
  persistenceError,
} from "./errors";

describe("persistence errors", () => {
  it("preserves typed details and causes", () => {
    const cause = new Error("native failure");
    const error = persistenceError(
      "REVISION_CONFLICT",
      "conflict",
      { expected: "one", actual: "two" },
      cause,
    );

    expect(error).toBeInstanceOf(PersistenceError);
    expect(isPersistenceError(error)).toBe(true);
    expect(isPersistenceError(cause)).toBe(false);
    expect(error).toMatchObject({
      name: "PersistenceError",
      code: "REVISION_CONFLICT",
      details: { expected: "one", actual: "two" },
      cause,
    });
  });
});
