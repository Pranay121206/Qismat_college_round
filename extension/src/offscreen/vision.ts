import { FilesetResolver, FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { PoseFrame, TrackingMode } from '../shared/messages';
import { OneEuroPointFilter } from '../shared/oneEuro';

type FaceLm = { x: number; y: number; z?: number };

export interface VisionStatus {
  fps: number;
  confidence: number;
  modelReady: boolean;
  warning?: string;
  error?: string;
}

export type GestureName =
  | 'TILT_LEFT' | 'TILT_RIGHT' | 'SWIPE_LEFT' | 'SWIPE_RIGHT'
  | 'MOUTH_CLICK' | 'SCROLL_DOWN' | 'SCROLL_UP' | 'SCROLL_STOP'
  | 'SWIPE_UP' | 'SWIPE_DOWN' | 'THUMB_UP' | 'THUMB_DOWN' | 'BROW_RAISE';

export interface StartResult {
  ok: boolean;
  error?: string;
}

const FRAME_INTERVAL_MS = 33;
const LOST_FRAMES_BEFORE_REPORT = 6;

function assetUrl(path: string): string {
  return chrome.runtime.getURL(path);
}

function friendlyCameraError(err: any): string {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission has not been granted. Open the Handsfree setup page and allow camera and microphone.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  return `Could not open the camera (${name || err?.message || 'unknown error'}).`;
}

export class VisionPipeline {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  private face: FaceLandmarker | null = null;
  private hand: HandLandmarker | null = null;
  private vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private faceLoading: Promise<void> | null = null;
  private handLoading: Promise<void> | null = null;
  private loadError: string | undefined;

  private stream: MediaStream | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private mode: TrackingMode = 'head';
  private onPose: ((pose: PoseFrame) => void) | null = null;
  private onStatus: ((status: VisionStatus) => void) | null = null;
  public onGesture: ((g: GestureName) => void) | null = null;

  // gesture state
  private lastGestureAt = 0;
  private tiltSince = 0;
  private tiltDir = 0;
  private mouthSince = 0;
  private mouthFired = false;
  private palmTrail: Array<{ t: number; x: number; y: number }> = [];
  private peaceAnchorY: number | null = null;
  private scrollState: 'none' | 'down' | 'up' = 'none';
  private peaceFrames = 0;
  private headEma: { x: number; y: number } | null = null;

  private lastVideoTime = -1;
  private lastDetectTs = 0;
  private framesThisSecond = 0;
  private fpsWindowStart = performance.now();
  private fps = 0;
  private lostFrames = 0;
  private lastLostReport = 0;
  private lightingWarning: string | undefined;
  private lastLightingCheck = 0;

  // hand state
  private pinching = false;
  private lastHandPoint = { x: 0.5, y: 0.5 };
  // Hand landmarks wobble by a few pixels every frame. Filtering here, in camera units,
  // removes that wobble BEFORE it is magnified by the camera-to-screen mapping.
  private handFilter = new OneEuroPointFilter(1.0, 9.0, 1.0);
  private handLostFrames = 0;
  private thumbSince = 0;
  private thumbKind: 'up' | 'down' | null = null;
  private browSince = 0;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.video = video;
    this.canvas = canvas;
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public setMode(mode: TrackingMode): void {
    this.mode = mode;
    if (mode === 'hand') void this.ensureHand();
  }

  public isModelReady(): boolean {
    return this.mode === 'hand' ? !!this.hand : !!this.face;
  }

  private async getVisionFileset() {
    if (!this.vision) {
      this.vision = await FilesetResolver.forVisionTasks(assetUrl('mediapipe/wasm'));
    }
    return this.vision;
  }

  private async createWithFallback<T>(make: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
    try {
      return await make('GPU');
    } catch (gpuErr) {
      console.warn('[Handsfree Vision] GPU delegate unavailable, using CPU:', gpuErr);
      return await make('CPU');
    }
  }

  private ensureFace(): Promise<void> {
    if (this.face) return Promise.resolve();
    if (!this.faceLoading) {
      this.faceLoading = (async () => {
        try {
          const fileset = await this.getVisionFileset();
          this.face = await this.createWithFallback((delegate) =>
            FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: assetUrl('models/face_landmarker.task'), delegate },
              runningMode: 'VIDEO',
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: false
            })
          );
          this.loadError = undefined;
          console.log('[Handsfree Vision] Face model ready');
        } catch (err: any) {
          console.error('[Handsfree Vision] Face model failed to load:', err);
          this.loadError =
            'The face tracking model could not be loaded. In the extension folder run "npm run setup", then rebuild and reload the extension.';
          this.faceLoading = null;
        }
      })();
    }
    return this.faceLoading;
  }

  private ensureHand(): Promise<void> {
    if (this.hand) return Promise.resolve();
    if (!this.handLoading) {
      this.handLoading = (async () => {
        try {
          const fileset = await this.getVisionFileset();
          this.hand = await this.createWithFallback((delegate) =>
            HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: assetUrl('models/hand_landmarker.task'), delegate },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6
            })
          );
          console.log('[Handsfree Vision] Hand model ready');
        } catch (err) {
          console.error('[Handsfree Vision] Hand model failed to load:', err);
          this.loadError = 'The hand tracking model could not be loaded. Run "npm run setup" and rebuild.';
          this.handLoading = null;
        }
      })();
    }
    return this.handLoading;
  }

  public async start(
    onPose: (pose: PoseFrame) => void,
    onStatus: (status: VisionStatus) => void
  ): Promise<StartResult> {
    this.onPose = onPose;
    this.onStatus = onStatus;
    if (this.running) return { ok: true };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: false
      });
    } catch (err) {
      console.error('[Handsfree Vision] getUserMedia failed:', err);
      return { ok: false, error: friendlyCameraError(err) };
    }

    this.video.srcObject = this.stream;
    this.video.muted = true;
    try {
      await this.video.play();
    } catch {
      /* autoplay is set on the element; play() can reject harmlessly */
    }

    this.running = true;
    this.fpsWindowStart = performance.now();
    this.tick();

    // Load models in the background; frames start flowing once they are ready.
    void this.ensureFace().then(() => {
      if (this.mode === 'hand') void this.ensureHand();
      this.reportStatus();
    });
    return { ok: true };
  }

  public stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.lastVideoTime = -1;
  }

  private tick = (): void => {
    if (!this.running) return;
    const started = performance.now();
    try {
      this.processFrame(started);
    } catch (err) {
      console.warn('[Handsfree Vision] frame error:', err);
    }
    if (started - this.fpsWindowStart >= 1000) {
      this.fps = Math.round((this.framesThisSecond * 1000) / (started - this.fpsWindowStart));
      this.framesThisSecond = 0;
      this.fpsWindowStart = started;
      this.reportStatus();
    }
    const elapsed = performance.now() - started;
    this.timer = setTimeout(this.tick, Math.max(1, FRAME_INTERVAL_MS - elapsed));
  };

  private reportStatus(confidence = this.lostFrames > 0 ? 0 : 0.95): void {
    this.onStatus?.({
      fps: this.fps,
      confidence,
      modelReady: this.isModelReady(),
      warning: this.lightingWarning,
      error: this.loadError
    });
  }

  private processFrame(now: number): void {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    if (now - this.lastLightingCheck > 1500) {
      this.lastLightingCheck = now;
      this.lightingWarning = this.checkLighting();
    }

    // detectForVideo needs strictly increasing timestamps
    const ts = Math.max(this.lastDetectTs + 1, Math.round(now));
    this.lastDetectTs = ts;

    if (this.mode === 'hand') {
      if (!this.hand) return;
      this.framesThisSecond++;
      this.processHand(ts, now);
      return;
    }

    if (!this.face) return;
    this.framesThisSecond++;
    this.processHead(ts, now);
  }

  private processHead(ts: number, now: number): void {
    const result = this.face!.detectForVideo(this.video, ts);
    const lm = result.faceLandmarks?.[0] as FaceLm[] | undefined;

    if (!lm || lm.length < 400) {
      this.headEma = null;
      this.reportLost(now);
      return;
    }

    this.lostFrames = 0;

    const nose = lm[1];
    const cheekA = lm[234];
    const cheekB = lm[454];
    const eyeA = lm[33];
    const eyeB = lm[263];
    const chin = lm[152];

    const faceWidth = Math.abs(cheekB.x - cheekA.x);
    const eyeMidY = (eyeA.y + eyeB.y) / 2;
    const eyeToChin = chin.y - eyeMidY;
    if (faceWidth < 0.04 || eyeToChin < 0.03) {
      this.reportLost(now);
      return;
    }

    // Use several points along the nose bridge instead of one tip: the average is far steadier.
    const pts = [1, 4, 5, 195, 197, 6].map((i) => lm[i]);
    const nx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const ny = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    // Yaw: nose between the cheek edges. Pitch: nose between the eye line and the chin.
    // Both are ratios so they ignore distance from the camera.
    let rawX = (nx - (cheekA.x + cheekB.x) / 2) / faceWidth;
    let rawY = (ny - eyeMidY) / eyeToChin;

    // light pre-smoothing removes landmark flicker before the pointer filters see it
    if (this.headEma) {
      rawX = this.headEma.x + (rawX - this.headEma.x) * 0.55;
      rawY = this.headEma.y + (rawY - this.headEma.y) * 0.55;
    }
    this.headEma = { x: rawX, y: rawY };

    // ---- gestures ----
    const bs = result.faceBlendshapes?.[0]?.categories as Array<{ categoryName: string; score: number }> | undefined;
    const jaw = bs?.find((c) => c.categoryName === 'jawOpen')?.score ?? 0;
    // Mouth-open click: hold the mouth open ~0.3s. Pointer is frozen meanwhile (pose reports jaw).
    if (jaw > 0.45) {
      if (!this.mouthSince) this.mouthSince = now;
      if (!this.mouthFired && now - this.mouthSince > 300) {
        this.mouthFired = true;
        this.fire('MOUTH_CLICK', 900);
      }
    } else if (jaw < 0.2) {
      this.mouthSince = 0;
      this.mouthFired = false;
    }
    // Head tilt (roll): ear toward shoulder, held ~0.5s, switches tab.
    const roll = (Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x) * 180) / Math.PI;
    const dir = roll > 17 ? 1 : roll < -17 ? -1 : 0;
    if (dir !== 0 && jaw < 0.3) {
      if (dir !== this.tiltDir) { this.tiltDir = dir; this.tiltSince = now; }
      else if (now - this.tiltSince > 500) {
        // camera is not mirrored: roll>0 means the user's head tilted to their left
        if (this.fire(dir > 0 ? 'TILT_LEFT' : 'TILT_RIGHT', 1400)) this.tiltSince = now + 1000;
      }
    } else {
      this.tiltDir = 0;
    }

    // Raise both eyebrows and hold ~0.6s: open a browser search (opens Google, then dictate).
    const brow = ((bs?.find((c) => c.categoryName === 'browInnerUp')?.score ?? 0) +
      (bs?.find((c) => c.categoryName === 'browOuterUpLeft')?.score ?? 0) +
      (bs?.find((c) => c.categoryName === 'browOuterUpRight')?.score ?? 0)) / 3;
    if (brow > 0.55 && jaw < 0.25) {
      if (!this.browSince) this.browSince = now;
      else if (now - this.browSince > 600) { if (this.fire('BROW_RAISE', 2500)) this.browSince = now + 1500; }
    } else if (brow < 0.3) {
      this.browSince = 0;
    }

    this.onPose?.({
      type: 'POSE_FRAME',
      rawX,
      rawY,
      confidence: 0.95,
      timestamp: Date.now(),
      mode: 'head',
      faceLost: false,
      hold: jaw > 0.25 || Math.abs(roll) > 12 || brow > 0.4,
      lightingWarning: this.lightingWarning
    });
  }

  /** Fire a gesture with a cooldown so one movement never triggers twice. */
  private fire(g: GestureName, cooldownMs: number): boolean {
    const t = performance.now();
    if (t - this.lastGestureAt < cooldownMs && g !== 'SCROLL_STOP' && g !== 'SCROLL_DOWN' && g !== 'SCROLL_UP') return false;
    this.lastGestureAt = t;
    this.onGesture?.(g);
    return true;
  }

  private processHand(ts: number, now: number): void {
    const result = this.hand!.detectForVideo(this.video, ts);
    const lm = result.landmarks?.[0];
    if (!lm) {
      this.endPeace();
      this.palmTrail = [];
      this.thumbKind = null;
      this.handLostFrames++;
      // After a real loss, forget the filter so the pointer does not glide in from the old spot.
      if (this.handLostFrames > 8) this.handFilter.reset();
      this.reportLost(now);
      return;
    }
    this.handLostFrames = 0;
    this.lostFrames = 0;

    const tip = lm[8];
    const thumb = lm[4];
    const wrist = lm[0];
    const midMcp = lm[9];
    const handSize = Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y) || 0.1;
    const ratio = Math.hypot(tip.x - thumb.x, tip.y - thumb.y) / handSize;

    // finger extension: tip farther from the wrist than the knuckle
    const ext = (t: number, m: number) => Math.hypot(lm[t].x - wrist.x, lm[t].y - wrist.y) > Math.hypot(lm[m].x - wrist.x, lm[m].y - wrist.y) * 1.15;
    const indexUp = ext(8, 5), midUp = ext(12, 9), ringUp = ext(16, 13), pinkyUp = ext(20, 17);
    const peace = indexUp && midUp && !ringUp && !pinkyUp && ratio > 0.7;
    const openPalm = indexUp && midUp && ringUp && pinkyUp;

    // hysteresis so the pinch does not flicker
    this.pinching = !peace && (this.pinching ? ratio < 0.4 : ratio < 0.26);

    // Pointer anchor = centre of the palm (wrist + the four knuckles). It barely moves when the
    // fingers move, unlike the fingertip, and averaging five points cancels most landmark noise.
    const palm = [0, 5, 9, 13, 17];
    const ax = palm.reduce((a, i) => a + lm[i].x, 0) / palm.length;
    const ay = palm.reduce((a, i) => a + lm[i].y, 0) / palm.length;
    const curled = !indexUp && !midUp && !ringUp && !pinkyUp;
    // Thumbs up / down: thumb out, every other finger curled.
    const thumbOut = Math.hypot(lm[4].x - lm[17].x, lm[4].y - lm[17].y) > handSize * 1.1;
    const thumbUpPose = curled && thumbOut && lm[4].y < lm[3].y && lm[4].y < lm[5].y - handSize * 0.3;
    const thumbDownPose = curled && thumbOut && lm[4].y > lm[3].y && lm[4].y > lm[0].y + handSize * 0.2;
    const thumbNow: 'up' | 'down' | null = thumbUpPose ? 'up' : thumbDownPose ? 'down' : null;
    if (thumbNow) {
      if (thumbNow !== this.thumbKind) { this.thumbKind = thumbNow; this.thumbSince = now; }
      else if (now - this.thumbSince > 700) {
        if (this.fire(thumbNow === 'up' ? 'THUMB_UP' : 'THUMB_DOWN', 2000)) this.thumbSince = now + 1500;
      }
    } else {
      this.thumbKind = null;
    }
    const posing = !!thumbNow; // freeze the pointer while making a thumb gesture
    if (ratio > 0.5 && !peace && !posing) {
      const f = this.handFilter.filter(1 - ax, ay, now);
      this.lastHandPoint = { x: f.x, y: f.y };
    }

    // ---- peace sign: raise/lower hand to scroll ----
    if (peace) {
      this.peaceFrames++;
      if (this.peaceFrames > 6) {
        if (this.peaceAnchorY === null) this.peaceAnchorY = ay;
        const dy = ay - this.peaceAnchorY;
        const next: 'none' | 'down' | 'up' = dy > 0.07 ? 'down' : dy < -0.07 ? 'up' : 'none';
        if (next !== this.scrollState) {
          this.scrollState = next;
          this.fire(next === 'down' ? 'SCROLL_DOWN' : next === 'up' ? 'SCROLL_UP' : 'SCROLL_STOP', 0);
        }
      }
    } else {
      this.endPeace();
    }

    // ---- open-palm swipe left/right: previous / next tab ----
    if (openPalm && !this.pinching) {
      const px = 1 - (lm[0].x + lm[9].x) / 2;
      this.palmTrail.push({ t: now, x: px, y: ay });
      while (this.palmTrail.length && now - this.palmTrail[0].t > 450) this.palmTrail.shift();
      if (this.palmTrail.length > 4) {
        const first = this.palmTrail[0];
        const dx = px - first.x;
        const dyy = Math.abs(ay - first.y);
        const dyv = ay - first.y;
        if (Math.abs(dx) > 0.3 && dyy < 0.12) {
          // mirrored image: positive dx = user moved hand to their right
          if (this.fire(dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT', 1200)) this.palmTrail = [];
        } else if (Math.abs(dyv) > 0.3 && Math.abs(dx) < 0.1) {
          if (this.fire(dyv > 0 ? 'SWIPE_DOWN' : 'SWIPE_UP', 1200)) this.palmTrail = [];
        }
      }
    } else {
      this.palmTrail = [];
    }

    this.onPose?.({
      type: 'POSE_FRAME',
      rawX: this.lastHandPoint.x,
      rawY: this.lastHandPoint.y,
      confidence: 0.9,
      timestamp: Date.now(),
      mode: 'hand',
      faceLost: false,
      pinch: this.pinching,
      hold: posing,
      lightingWarning: this.lightingWarning
    });
  }

  private endPeace(): void {
    this.peaceFrames = 0;
    this.peaceAnchorY = null;
    if (this.scrollState !== 'none') {
      this.scrollState = 'none';
      this.fire('SCROLL_STOP', 0);
    }
  }

  private reportLost(now: number): void {
    this.lostFrames++;
    if (this.lostFrames >= LOST_FRAMES_BEFORE_REPORT && now - this.lastLostReport > 400) {
      this.lastLostReport = now;
      this.onPose?.({
        type: 'POSE_FRAME',
        rawX: 0,
        rawY: 0,
        confidence: 0,
        timestamp: Date.now(),
        mode: this.mode,
        faceLost: true,
        lightingWarning: this.lightingWarning
      });
    }
  }

  private checkLighting(): string | undefined {
    if (!this.ctx) return undefined;
    try {
      this.ctx.drawImage(this.video, 0, 0, 64, 48);
      const data = this.ctx.getImageData(0, 0, 64, 48).data;
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const avg = total / (64 * 48);
      if (avg < 40) return 'Too dark. Face a light or lamp.';
      if (avg > 225) return 'Too bright or backlit. Move away from the window.';
    } catch {
      /* ignore */
    }
    return undefined;
  }
}
