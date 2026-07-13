import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256 } from "./integrity";

describe("integrity helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("canonicalizes nested objects while preserving array order", () => {
    expect(
      canonicalJson({
        zebra: 1,
        omitted: undefined,
        alpha: { y: 2, x: 1 },
        list: [{ b: 2, a: 1 }, undefined],
      }),
    ).toBe('{"alpha":{"x":1,"y":2},"list":[{"a":1,"b":2},null],"zebra":1}');
  });

  it("produces the same hash for objects with different key insertion order", async () => {
    await expect(sha256({ b: 2, a: { d: 4, c: 3 } })).resolves.toBe(
      await sha256({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("reports unavailable Web Crypto and propagates digest failures", async () => {
    vi.stubGlobal("crypto", {});
    await expect(sha256({ value: 1 })).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });

    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockRejectedValue(new Error("digest failed")),
      },
    });
    await expect(sha256({ value: 1 })).rejects.toThrow("digest failed");
  });
});
