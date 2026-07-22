export interface StorageStatus {
  persisted: boolean | null;
  quota: number | null;
  usage: number | null;
}
