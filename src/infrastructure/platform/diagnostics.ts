import type { StorageStatus } from "./storage";

export interface DiagnosticInput {
  appVersion: string;
  schemaVersion: number;
  activeRevision: string | null;
  lastSavedAt: string | null;
  storage: StorageStatus | null;
  season: {
    name: string;
    roundInSeason: number;
    roundsPerSeason: number;
  } | null;
}

export function buildSanitizedDiagnostics(input: DiagnosticInput): string {
  return JSON.stringify(
    {
      appVersion: input.appVersion,
      schemaVersion: input.schemaVersion,
      activeRevision: input.activeRevision,
      lastSavedAt: input.lastSavedAt,
      online: navigator.onLine,
      storage: input.storage,
      season: input.season,
      capabilities: {
        broadcastChannel: "BroadcastChannel" in window,
        indexedDb: "indexedDB" in window,
        persistentStorage: typeof navigator.storage?.persist === "function",
        serviceWorker: "serviceWorker" in navigator,
        wakeLock: "wakeLock" in navigator,
      },
      userAgent: navigator.userAgent,
    },
    null,
    2,
  );
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is not available in this browser.");
  }
  await navigator.clipboard.writeText(text);
}
