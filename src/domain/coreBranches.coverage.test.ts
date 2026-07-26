/**
 * Coverage for defensive branches in the core domain helpers.
 *
 * These paths are reachable but rarely exercised by the gameplay-level tests:
 * timestamp parsing rejects malformed calendar values and clock accrual guards
 * a missing current player.
 */
import { describe, expect, it } from "vitest";
import { elapsedActiveMilliseconds, parseIsoTimestamp } from "./clock";
import { asIsoTimestamp, firstFailure } from "./index";

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
