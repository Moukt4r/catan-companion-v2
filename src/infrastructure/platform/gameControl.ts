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

export class BrowserGameControl implements GameControl {
  private releaseCurrent: (() => void) | null = null;
  private heldRequest: Promise<unknown> | null = null;

  async acquire(gameId: GameId): Promise<boolean> {
    await this.release();
    const locks = (navigator as NavigatorWithLocks).locks;
    if (!locks) {
      return true;
    }

    let resolveAcquisition: ((acquired: boolean) => void) | null = null;
    const acquisition = new Promise<boolean>((resolve) => {
      resolveAcquisition = resolve;
    });
    this.heldRequest = locks.request(
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
    );
    const acquired = await acquisition;
    if (!acquired) {
      await this.heldRequest;
      this.heldRequest = null;
    }
    return acquired;
  }

  async release(): Promise<void> {
    this.releaseCurrent?.();
    this.releaseCurrent = null;
    if (this.heldRequest) {
      await this.heldRequest;
      this.heldRequest = null;
    }
  }
}
