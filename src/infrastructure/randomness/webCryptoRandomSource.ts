import type { RandomSource } from "../../domain";

export class WebCryptoRandomSource implements RandomSource {
  constructor(private readonly cryptoApi: Crypto = globalThis.crypto) {}

  nextUint32(): number {
    if (typeof this.cryptoApi?.getRandomValues !== "function") {
      throw new Error("Web Crypto getRandomValues is unavailable.");
    }
    const value = new Uint32Array(1);
    this.cryptoApi.getRandomValues(value);
    return value[0] as number;
  }
}
