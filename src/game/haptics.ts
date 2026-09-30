/**
 * Centralised haptic feedback. The driver is swappable so a native
 * implementation (e.g. Capacitor Haptics) can replace the Vibration API.
 */
export interface HapticsDriver {
  vibrate(pattern: number | number[]): void;
}

const webDriver: HapticsDriver = {
  vibrate(pattern) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* unsupported */
      }
    }
  },
};

class Haptics {
  enabled = true;
  private driver: HapticsDriver = webDriver;
  private lastAt = 0;

  useDriver(driver: HapticsDriver): void {
    this.driver = driver;
  }

  light(): void {
    this.fire(8, 40);
  }
  medium(): void {
    this.fire(18, 60);
  }
  heavy(): void {
    this.fire([35, 20, 25], 0);
  }
  warning(): void {
    this.fire(6, 120);
  }
  success(): void {
    this.fire([20, 60, 20, 60, 60], 0);
  }
  error(): void {
    this.fire([80, 40, 120], 0);
  }

  private fire(pattern: number | number[], minGapMs: number): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastAt < minGapMs) return;
    this.lastAt = now;
    this.driver.vibrate(pattern);
  }
}

export const haptics = new Haptics();
