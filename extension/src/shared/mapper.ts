import { CalibrationProfile } from './settings';

export interface Vec2 {
  x: number;
  y: number;
}

/** How far toward the screen edge the calibration targets sit (fraction of half the screen). */
export const CALIBRATION_REACH = 0.85;

const MIN_SPAN_X = 0.025;
const MIN_SPAN_Y = 0.015;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function medianPoint(samples: Vec2[]): Vec2 {
  return { x: median(samples.map((s) => s.x)), y: median(samples.map((s) => s.y)) };
}

export interface CalibrationSamples {
  center: Vec2;
  left: Vec2;
  right: Vec2;
  up: Vec2;
  down: Vec2;
}

export type CalibrationResult =
  | { ok: true; profile: CalibrationProfile }
  | { ok: false; reason: string };

/**
 * Turn the five measured poses into a mapping profile. The direction of each axis
 * is read from the data itself, so it does not matter how the camera image is oriented.
 */
export function computeCalibration(s: CalibrationSamples): CalibrationResult {
  const widthSpread = Math.abs(s.right.x - s.left.x);
  const heightSpread = Math.abs(s.down.y - s.up.y);

  if (widthSpread < MIN_SPAN_X * 1.5) {
    return { ok: false, reason: 'Left and right looked almost the same. Turn your head further to each side.' };
  }
  if (heightSpread < MIN_SPAN_Y * 1.5) {
    return { ok: false, reason: 'Up and down looked almost the same. Tilt your head further up and down.' };
  }

  const dirX: 1 | -1 = s.right.x >= s.left.x ? 1 : -1;
  const dirY: 1 | -1 = s.down.y >= s.up.y ? 1 : -1;

  const cx = s.center.x;
  const cy = s.center.y;

  const spanRight = Math.max(MIN_SPAN_X, Math.abs(s.right.x - cx)) / CALIBRATION_REACH;
  const spanLeft = Math.max(MIN_SPAN_X, Math.abs(cx - s.left.x)) / CALIBRATION_REACH;
  const spanDown = Math.max(MIN_SPAN_Y, Math.abs(s.down.y - cy)) / CALIBRATION_REACH;
  const spanUp = Math.max(MIN_SPAN_Y, Math.abs(cy - s.up.y)) / CALIBRATION_REACH;

  return {
    ok: true,
    profile: { calibrated: true, cx, cy, spanRight, spanLeft, spanDown, spanUp, dirX, dirY, timestamp: Date.now() }
  };
}

/** Raw head feature -> normalized screen position in -1..1 on each axis (0 = center of screen). */
export function mapHead(raw: Vec2, cal: CalibrationProfile, sensitivity: number, deadZone: number): Vec2 {
  const ux = (raw.x - cal.cx) * cal.dirX; // positive = toward screen right
  const uy = (raw.y - cal.cy) * cal.dirY; // positive = toward screen bottom

  let nx = ux >= 0 ? ux / cal.spanRight : ux / cal.spanLeft;
  let ny = uy >= 0 ? uy / cal.spanDown : uy / cal.spanUp;

  nx = applyDeadZone(nx * sensitivity, deadZone);
  ny = applyDeadZone(ny * sensitivity, deadZone);

  return { x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) };
}

/** Hand mode: the central part of the camera image maps to the whole screen. */
export function mapHand(raw: Vec2, sensitivity: number): Vec2 {
  const halfBox = 0.32 / Math.max(0.3, sensitivity);
  return {
    x: clamp((raw.x - 0.5) / halfBox, -1, 1),
    y: clamp((raw.y - 0.5) / halfBox, -1, 1)
  };
}

/** Normalized (-1..1) -> pixel position inside the viewport, keeping a small margin. */
export function toScreen(n: Vec2, width: number, height: number, margin = 6): Vec2 {
  return {
    x: clamp(width / 2 + n.x * (width / 2 - margin), margin, width - margin),
    y: clamp(height / 2 + n.y * (height / 2 - margin), margin, height - margin)
  };
}

/** Make the current pose the new center without touching the measured ranges. */
export function recenter(cal: CalibrationProfile, raw: Vec2): CalibrationProfile {
  return { ...cal, cx: raw.x, cy: raw.y, timestamp: Date.now() };
}

function applyDeadZone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Slider 0..1 -> One Euro parameters. */
export function smoothingToParams(smoothing: number): { minCutoff: number; beta: number } {
  const s = clamp(smoothing, 0, 1);
  // Filtering happens in screen pixels. Low minCutoff = rock steady when still,
  // beta lets the pointer catch up quickly when you move on purpose.
  return { minCutoff: 1.4 - s * 1.1, beta: 0.006 + (1 - s) * 0.01 };
}

/**
 * Pointer stabiliser: ignores tiny movements (sensor noise) and only follows once the
 * target leaves a small radius. Radius shrinks while moving fast so it never feels laggy.
 */
export class Stabilizer {
  private ox = 0;
  private oy = 0;
  private init = false;
  public radius = 3.5;
  public update(x: number, y: number): Vec2 {
    if (!this.init) { this.ox = x; this.oy = y; this.init = true; return { x, y }; }
    const d = Math.hypot(x - this.ox, y - this.oy);
    if (d > this.radius) {
      const k = (d - this.radius) / d;
      this.ox += (x - this.ox) * k;
      this.oy += (y - this.oy) * k;
    }
    return { x: this.ox, y: this.oy };
  }
  public reset(): void { this.init = false; }
}
