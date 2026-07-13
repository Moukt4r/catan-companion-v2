import { asCommandId, asGameId, asIsoTimestamp, asRevisionId } from "../domain";
import type {
  CommandId,
  GameId,
  GeneratedIdKind,
  IdSource,
  IsoTimestamp,
  RevisionId,
} from "../domain";
import type { ImportIdSource } from "./persistence";

export interface RuntimeDependencies extends ImportIdSource {
  domainIds(): IdSource;
}

function requireCrypto(): Crypto {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new Error("Web Crypto randomUUID is unavailable.");
  }
  return globalThis.crypto;
}

export class BrowserRuntimeDependencies implements RuntimeDependencies {
  gameId(): GameId {
    return asGameId(requireCrypto().randomUUID());
  }

  revisionId(): RevisionId {
    return asRevisionId(requireCrypto().randomUUID());
  }

  commandId(): CommandId {
    return asCommandId(requireCrypto().randomUUID());
  }

  now(): IsoTimestamp {
    return asIsoTimestamp(new Date().toISOString());
  }

  domainIds(): IdSource {
    return {
      next: (kind: GeneratedIdKind) =>
        `${kind}-${requireCrypto().randomUUID()}`,
    };
  }
}
