export interface StorageStatus {
  persisted: boolean | null;
  quota: number | null;
  usage: number | null;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage;
  if (!storage) {
    return {
      persisted: null,
      quota: null,
      usage: null,
    };
  }

  const [persisted, estimate] = await Promise.all([
    storage.persisted?.() ?? Promise.resolve(false),
    storage.estimate(),
  ]);

  return {
    persisted,
    quota: estimate.quota ?? null,
    usage: estimate.usage ?? null,
  };
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) {
    return null;
  }

  return navigator.storage.persist();
}
