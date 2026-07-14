import { describe, expect, it } from "vitest";
import { formatDuration } from "./time";

describe("formatDuration", () => {
  it("formats active milliseconds as an hours clock", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(65_999)).toBe("00:01:05");
    expect(formatDuration(3_661_000)).toBe("01:01:01");
  });

  it("clamps negative durations", () => {
    expect(formatDuration(-1_000)).toBe("00:00:00");
  });
});
