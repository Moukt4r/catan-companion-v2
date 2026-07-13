import { domainError, failure, success } from "./errors";
import type { BoundedIntSource, DomainResult, RandomSource } from "./types";

const UINT32_RANGE = 0x1_0000_0000;

export function uniformBoundedInt(
  source: RandomSource,
  upperExclusive: number,
): DomainResult<number> {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive <= 0) {
    return failure(
      domainError(
        "INVALID_COMMAND",
        "The random bound must be a positive safe integer.",
        { upperExclusive },
      ),
    );
  }

  const limit = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  for (;;) {
    const candidate = source.nextUint32();
    if (
      !Number.isInteger(candidate) ||
      candidate < 0 ||
      candidate >= UINT32_RANGE
    ) {
      return failure(
        domainError(
          "INVALID_COMMAND",
          "RandomSource.nextUint32() returned an invalid value.",
          { candidate },
        ),
      );
    }
    if (candidate < limit) {
      return success(candidate % upperExclusive);
    }
  }
}

export function toBoundedInt(
  source: RandomSource | BoundedIntSource,
): BoundedIntSource {
  if (typeof source === "function") {
    return source;
  }
  return (upperExclusive) => {
    const result = uniformBoundedInt(source, upperExclusive);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    return result.value;
  };
}

export function fisherYates<T>(
  values: readonly T[],
  source: RandomSource | BoundedIntSource,
): T[] {
  const boundedInt = toBoundedInt(source);
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = boundedInt(index + 1);
    if (!Number.isInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
      throw new Error(
        `Bounded random source returned ${swapIndex} for bound ${index + 1}.`,
      );
    }
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex] as T;
    shuffled[swapIndex] = current as T;
  }
  return shuffled;
}
