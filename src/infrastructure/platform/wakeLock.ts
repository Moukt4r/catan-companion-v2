interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: WakeLockLike;
};

export class ScreenWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;

  get supported(): boolean {
    return Boolean((navigator as NavigatorWithWakeLock).wakeLock);
  }

  get active(): boolean {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  async acquire(): Promise<boolean> {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) {
      return false;
    }

    this.sentinel = await wakeLock.request("screen");
    this.sentinel.addEventListener(
      "release",
      () => {
        this.sentinel = null;
      },
      {
        once: true,
      },
    );
    return true;
  }

  async release(): Promise<void> {
    await this.sentinel?.release();
    this.sentinel = null;
  }
}
