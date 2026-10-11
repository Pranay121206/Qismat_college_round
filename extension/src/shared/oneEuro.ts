/**
 * 1€ Filter (One Euro Filter)
 * Reference: Casiez, G., Roussel, N. and Vogel, D. (2012)
 * 1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Human-Computer Interaction.
 */

export class LowPassFilter {
  private y: number;
  private s: number;
  private initialized: boolean = false;

  constructor(alpha: number = 0, initVal: number = 0) {
    this.y = this.s = initVal;
    this.initialized = false;
  }

  public filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
      return value;
    }
    this.s = alpha * value + (1.0 - alpha) * this.s;
    return this.s;
  }

  public last(): number {
    return this.s;
  }

  public reset(): void {
    this.initialized = false;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTime: number | null = null;

  /**
   * @param minCutoff Minimum cutoff frequency (Hz). Lower = less jitter when still (e.g. 1.0)
   * @param beta Speed coefficient. Higher = less lag when moving fast (e.g. 0.007)
   * @param dCutoff Cutoff frequency for derivative (Hz, default 1.0)
   */
  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(x: number, timestamp: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(x, 1.0);
    }

    const dt = (timestamp - this.lastTime) / 1000.0;
    this.lastTime = timestamp;

    // Guard against identical timestamps or huge jumps
    if (dt <= 0 || dt > 1.0) {
      return this.xFilter.filter(x, 1.0);
    }

    const rate = 1.0 / dt;

    // Filter the derivative
    const dx = (x - this.xFilter.last()) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // Dynamic cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter value
    return this.xFilter.filter(x, this.alpha(rate, cutoff));
  }

  public reset(): void {
    this.lastTime = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }

  public setParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }
}

export class OneEuroPointFilter {
  private xFilter: OneEuroFilter;
  private yFilter: OneEuroFilter;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.xFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.yFilter = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public filter(x: number, y: number, timestamp: number): { x: number; y: number } {
    return {
      x: this.xFilter.filter(x, timestamp),
      y: this.yFilter.filter(y, timestamp)
    };
  }

  public reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
  }

  public setParams(minCutoff: number, beta: number): void {
    this.xFilter.setParams(minCutoff, beta);
    this.yFilter.setParams(minCutoff, beta);
  }
}
