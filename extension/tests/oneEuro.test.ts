import { describe, it, expect } from 'vitest';
import { OneEuroFilter, OneEuroPointFilter } from '../src/shared/oneEuro';

describe('OneEuroFilter', () => {
  it('smooths values and responds dynamically to changes', () => {
    const filter = new OneEuroFilter(1.0, 0.007);
    const t0 = 1000;

    const v1 = filter.filter(10, t0);
    expect(v1).toBe(10); // First value initializes

    // Steady state: small change should be smoothed
    const v2 = filter.filter(10.5, t0 + 33);
    expect(v2).toBeLessThan(10.5);
    expect(v2).toBeGreaterThan(10);

    // Fast movement: sudden jump responds with higher responsiveness
    const v3 = filter.filter(50, t0 + 66);
    expect(v3).toBeGreaterThan(10.5);
  });
});

describe('OneEuroPointFilter', () => {
  it('filters 2D coordinates', () => {
    const pointFilter = new OneEuroPointFilter(1.0, 0.007);
    const p1 = pointFilter.filter(100, 200, 1000);
    expect(p1.x).toBe(100);
    expect(p1.y).toBe(200);

    const p2 = pointFilter.filter(102, 202, 1033);
    expect(p2.x).toBeGreaterThan(100);
    expect(p2.x).toBeLessThan(102);
    expect(p2.y).toBeGreaterThan(200);
    expect(p2.y).toBeLessThan(202);
  });
});
