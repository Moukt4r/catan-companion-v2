import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClockNow } from "./useClockNow";

afterEach(() => {
  vi.useRealTimers();
});

describe("useClockNow", () => {
  it("ticks only while the active clock is running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
    const { result, rerender } = renderHook(
      ({ running }) => useClockNow(running),
      {
        initialProps: { running: true },
      },
    );

    expect(result.current).toBe(new Date("2026-07-14T10:00:00.000Z").getTime());
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(new Date("2026-07-14T10:00:02.000Z").getTime());

    rerender({ running: false });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(new Date("2026-07-14T10:00:02.000Z").getTime());
  });
});
