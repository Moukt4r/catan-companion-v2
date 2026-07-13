import { describe, expect, it } from "vitest";
import { WebCryptoRandomSource } from "./webCryptoRandomSource";

describe("WebCryptoRandomSource", () => {
  it("reads an unsigned 32-bit value using getRandomValues", () => {
    let calls = 0;
    const cryptoApi: Crypto = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        calls += 1;
        if (array instanceof Uint32Array) {
          array[0] = 0xfedcba98;
        }
        return array;
      },
      randomUUID: crypto.randomUUID.bind(crypto),
      subtle: crypto.subtle,
    };
    const source = new WebCryptoRandomSource(cryptoApi);

    expect(source.nextUint32()).toBe(0xfedcba98);
    expect(calls).toBe(1);
  });

  it("fails clearly when getRandomValues is unavailable", () => {
    const source = new WebCryptoRandomSource({} as Crypto);

    expect(() => source.nextUint32()).toThrow(
      "Web Crypto getRandomValues is unavailable.",
    );
  });

  it("propagates failures from the crypto implementation", () => {
    const source = new WebCryptoRandomSource({
      getRandomValues: () => {
        throw new Error("entropy source failed");
      },
    } as unknown as Crypto);

    expect(() => source.nextUint32()).toThrow("entropy source failed");
  });
});
