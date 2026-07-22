import type { GameControl } from "../../application";
import type { GameId } from "../../domain";

interface LockLike {
  readonly name: string;
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { ifAvailable: true; mode: "exclusive" },
    callback: (lock: LockLike | null) => Promise<T>,
  ): Promise<T>;
}

type NavigatorWithLocks = Navigator & {
  locks?: LockManagerLike;
};

interface FallbackLease {
  ownerId: string;
  expiresAt: number;
}

const FALLBACK_LEASE_MS = 5_000;
const FALLBACK_HEARTBEAT_MS = 1_500;
const FALLBACK_SETTLE_MS = 50;

export class BrowserGameControl implements GameControl {
  private releaseCurrent: (() => void) | null = null;
  private heldRequest: Promise<unknown> | null = null;
  private fallbackKey: string | null = null;
  private fallbackStorage: Storage | null = null;
  private fallbackHeartbeat: number | null = null;
  private controlledGameId: GameId | null = null;
  private uncoordinated = false;
  private listeningForPageHide = false;
  private readonly ownerId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly onPageHide = () => {
    this.releaseCurrent?.();
    this.releaseCurrent = null;
    this.releaseFallbackLease();
    this.controlledGameId = null;
    this.uncoordinated = false;
    this.stopListeningForPageHide();
  };

  async acquire(gameId: GameId): Promise<boolean> {
    await this.release();
    const locks = (navigator as NavigatorWithLocks).locks;
    if (!locks) {
      return this.acquireFallbackLease(gameId);
    }

    let resolveAcquisition: ((acquired: boolean) => void) | null = null;
    let requestFailed = false;
    const acquisition = new Promise<boolean>((resolve) => {
      resolveAcquisition = resolve;
    });
    this.heldRequest = locks
      .request(
        `catan-table-companion:${gameId}`,
        { ifAvailable: true, mode: "exclusive" },
        async (lock) => {
          if (!lock) {
            resolveAcquisition?.(false);
            return;
          }
          resolveAcquisition?.(true);
          await new Promise<void>((resolve) => {
            this.releaseCurrent = resolve;
          });
        },
      )
      .catch(() => {
        requestFailed = true;
        resolveAcquisition?.(false);
      });
    const acquired = await acquisition;
    if (!acquired) {
      await this.heldRequest;
      this.heldRequest = null;
      return requestFailed ? this.acquireFallbackLease(gameId) : false;
    }
    this.controlledGameId = gameId;
    this.listenForPageHide();
    return true;
  }

  hasControl(gameId: GameId): boolean {
    if (this.controlledGameId !== gameId) {
      return false;
    }
    if (this.releaseCurrent !== null || this.uncoordinated) {
      return true;
    }
    if (this.fallbackKey === null || this.fallbackStorage === null) {
      return false;
    }
    const lease = readLease(this.fallbackStorage, this.fallbackKey);
    const held =
      lease?.ownerId === this.ownerId && lease.expiresAt > Date.now();
    if (!held) {
      this.releaseFallbackLease();
    }
    return held;
  }

  async release(): Promise<void> {
    this.releaseCurrent?.();
    this.releaseCurrent = null;
    if (this.heldRequest) {
      await this.heldRequest;
      this.heldRequest = null;
    }
    this.releaseFallbackLease();
    this.controlledGameId = null;
    this.uncoordinated = false;
    this.stopListeningForPageHide();
  }

  private async acquireFallbackLease(gameId: GameId): Promise<boolean> {
    const storage = availableLocalStorage();
    if (storage === null) {
      this.controlledGameId = gameId;
      this.uncoordinated = true;
      this.listenForPageHide();
      return true;
    }

    const key = `catan-table-companion:control:${gameId}`;
    const existing = readLease(storage, key);
    const now = Date.now();
    if (
      existing !== null &&
      existing.ownerId !== this.ownerId &&
      existing.expiresAt > now
    ) {
      return false;
    }

    try {
      storage.setItem(
        key,
        JSON.stringify({
          ownerId: this.ownerId,
          expiresAt: now + FALLBACK_LEASE_MS,
        } satisfies FallbackLease),
      );
    } catch {
      this.controlledGameId = gameId;
      this.uncoordinated = true;
      this.listenForPageHide();
      return true;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, FALLBACK_SETTLE_MS);
    });
    const confirmed = readLease(storage, key);
    if (confirmed?.ownerId !== this.ownerId) {
      return false;
    }

    this.fallbackKey = key;
    this.fallbackStorage = storage;
    this.controlledGameId = gameId;
    this.fallbackHeartbeat = window.setInterval(() => {
      const current = readLease(storage, key);
      if (current?.ownerId !== this.ownerId) {
        this.releaseFallbackLease();
        return;
      }
      try {
        storage.setItem(
          key,
          JSON.stringify({
            ownerId: this.ownerId,
            expiresAt: Date.now() + FALLBACK_LEASE_MS,
          } satisfies FallbackLease),
        );
      } catch {
        this.releaseFallbackLease();
      }
    }, FALLBACK_HEARTBEAT_MS);
    this.listenForPageHide();
    return true;
  }

  private releaseFallbackLease(): void {
    if (this.fallbackHeartbeat !== null) {
      window.clearInterval(this.fallbackHeartbeat);
      this.fallbackHeartbeat = null;
    }
    if (this.fallbackKey !== null && this.fallbackStorage !== null) {
      const current = readLease(this.fallbackStorage, this.fallbackKey);
      if (current?.ownerId === this.ownerId) {
        try {
          this.fallbackStorage.removeItem(this.fallbackKey);
        } catch {
          // Expected-head revision checks remain the final write safeguard.
        }
      }
    }
    this.fallbackKey = null;
    this.fallbackStorage = null;
    this.controlledGameId = null;
    this.uncoordinated = false;
  }

  private listenForPageHide(): void {
    if (!this.listeningForPageHide) {
      window.addEventListener("pagehide", this.onPageHide);
      this.listeningForPageHide = true;
    }
  }

  private stopListeningForPageHide(): void {
    if (this.listeningForPageHide) {
      window.removeEventListener("pagehide", this.onPageHide);
      this.listeningForPageHide = false;
    }
  }
}

function availableLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLease(storage: Storage, key: string): FallbackLease | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "ownerId" in value &&
      typeof value.ownerId === "string" &&
      "expiresAt" in value &&
      typeof value.expiresAt === "number"
    ) {
      return {
        ownerId: value.ownerId,
        expiresAt: value.expiresAt,
      };
    }
  } catch {
    return null;
  }
  return null;
}
