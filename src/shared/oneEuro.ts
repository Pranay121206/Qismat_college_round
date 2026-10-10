import type { FilterSettings } from './settings';

/**
 * Low-pass filter with smoothing factor alpha.
 * s_t = alpha * x_t + (1 - alpha) * s_{t-1}
 */
class LowPassFilter {
  private alpha: number;
  private s: number | null = null;

  constructor(alpha: number = 0) {
    this.alpha = alpha;
  }

  filter(value: number, alpha: number): number {
    this.alpha = alpha;
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    return this.s;
  }

  hasLast(): boolean {
    return this.s !== null;
  }

  last(): number {
    return this.s ?? 0;
  }

  reset(): void {
    this.s = null;
  }
}

/**
 * 1€ Filter (Casiez, Roussel, Vogel - CHI 2012)
 *
 * An adaptive low-pass filter designed for noisy, human-driven signals.
 * At low movement speeds, cutoff frequency is low to eliminate jitter.
 * At high speeds, cutoff frequency increases to eliminate lag.
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  constructor(config?: Partial<FilterSettings>) {
    this.minCutoff = config?.minCutoff ?? 1.0;
    this.beta = config?.beta ?? 0.007;
    this.dCutoff = config?.dCutoff ?? 1.0;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private computeAlpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  /**
   * Filters input value x at the given timestamp in milliseconds.
   */
  filter(x: number, timestamp: number): number {
    if (this.lastTime === null || this.lastTime === timestamp) {
      this.lastTime = timestamp;
      return this.xFilter.filter(x, 1.0);
    }

    // Convert elapsed time to seconds (clamped to prevent division by zero or extreme dt)
    const dt = Math.max((timestamp - this.lastTime) / 1000.0, 1e-5);
    this.lastTime = timestamp;

    // Estimate derivative (rate of change)
    const prevX = this.xFilter.hasLast() ? this.xFilter.last() : x;
    const dx = (x - prevX) / dt;
    const alphaD = this.computeAlpha(this.dCutoff, dt);
    const edx = this.dxFilter.filter(dx, alphaD);

    // Dynamic cutoff based on signal velocity
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const alphaX = this.computeAlpha(cutoff, dt);

    return this.xFilter.filter(x, alphaX);
  }

  /**
   * Reset filter state to initial conditions.
   */
  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }

  /**
   * Dynamically update filter tuning parameters.
   */
  updateConfig(config: Partial<FilterSettings>): void {
    if (config.minCutoff !== undefined && config.minCutoff > 0) {
      this.minCutoff = config.minCutoff;
    }
    if (config.beta !== undefined && config.beta >= 0) {
      this.beta = config.beta;
    }
    if (config.dCutoff !== undefined && config.dCutoff > 0) {
      this.dCutoff = config.dCutoff;
    }
  }

  getConfig(): FilterSettings {
    return {
      minCutoff: this.minCutoff,
      beta: this.beta,
      dCutoff: this.dCutoff,
    };
  }
}
