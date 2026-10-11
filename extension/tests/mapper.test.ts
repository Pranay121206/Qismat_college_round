import { describe, it, expect } from 'vitest';
import { computeCalibration, mapHead, toScreen, recenter } from '../src/shared/mapper';

const samples = {
  center: { x: 0.0, y: 0.5 },
  left: { x: 0.1, y: 0.5 }, // raw x grows when the user turns to screen-left
  right: { x: -0.1, y: 0.5 },
  up: { x: 0.0, y: 0.44 },
  down: { x: 0.0, y: 0.56 }
};

describe('calibration mapper', () => {
  const res = computeCalibration(samples);
  if (!res.ok) throw new Error('calibration failed');
  const cal = res.profile;

  it('learns axis direction from the data', () => {
    expect(cal.dirX).toBe(-1);
    expect(cal.dirY).toBe(1);
  });

  it('maps the calibration poses to the screen edges', () => {
    const r = mapHead({ x: -0.1, y: 0.5 }, cal, 1, 0);
    expect(r.x).toBeCloseTo(0.85, 1);
    const l = mapHead({ x: 0.1, y: 0.5 }, cal, 1, 0);
    expect(l.x).toBeCloseTo(-0.85, 1);
  });

  it('rests at the center', () => {
    const c = mapHead({ x: 0, y: 0.5 }, cal, 1, 0.01);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
  });

  it('clamps beyond the range', () => {
    const r = mapHead({ x: -1, y: 0.5 }, cal, 1, 0);
    expect(r.x).toBe(1);
  });

  it('recentering moves the rest point only', () => {
    const c2 = recenter(cal, { x: 0.05, y: 0.52 });
    expect(mapHead({ x: 0.05, y: 0.52 }, c2, 1, 0)).toEqual({ x: 0, y: 0 });
    expect(c2.spanRight).toBe(cal.spanRight);
  });

  it('rejects a calibration with no movement', () => {
    const bad = computeCalibration({ ...samples, left: { x: 0.001, y: 0.5 }, right: { x: -0.001, y: 0.5 } });
    expect(bad.ok).toBe(false);
  });

  it('converts to pixels', () => {
    const p = toScreen({ x: 0, y: 0 }, 1000, 800);
    expect(p).toEqual({ x: 500, y: 400 });
    expect(toScreen({ x: 1, y: 1 }, 1000, 800).x).toBeLessThanOrEqual(994);
  });
});
