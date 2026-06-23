/**
 * ============================================================================
 *  MOVEMENT-INTENSITY METRIC  (the "how fast are the two fingers running" number)
 * ============================================================================
 *
 * This module is deliberately isolated and dependency-free so the sensitivity
 * can be tuned without touching tracking, networking, or rendering code.
 *
 * Input : the 21 MediaPipe hand landmarks for one video frame (normalized 0..1
 *         image coordinates), plus a timestamp.
 * Output: a single smoothed scalar — bigger = faster finger motion.
 *
 * The game is controlled by "running" with two fingers: the INDEX finger
 * (landmark 8) is one leg and the MIDDLE finger (landmark 12) is the other.
 * Only the motion of those two fingertips *relative to the hand itself* counts.
 *
 * How it works, step by step:
 *   1. Build a hand-local coordinate frame each frame:
 *        - origin  = the wrist (landmark 0)
 *        - up axis = wrist -> middle-finger knuckle (landmark 9)
 *        - scale   = the length of that wrist->knuckle vector (hand size)
 *   2. Express the index + middle fingertips in that frame. Because the frame
 *      is anchored to the hand, sliding / rotating / moving the whole hand
 *      toward or away from the camera does NOT move the fingertips within it —
 *      only actually bending or spreading the fingers does. This is what stops
 *      you from gaining score by just waving your hand around.
 *   3. Measure how far those local fingertip positions moved since last frame.
 *   4. Divide by elapsed time -> a velocity (per second), not just per frame,
 *      so it's independent of webcam frame rate.
 *   5. Exponentially smooth it so the number doesn't jitter frame to frame.
 *
 * Tune `DEFAULT_TUNING` to change feel. Every knob is documented inline.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface IntensityTuning {
  /**
   * Which landmarks act as "legs". Default: index fingertip (8) and middle
   * fingertip (12) — the two fingers you run with.
   */
  fingertipIndices: number[];
  /**
   * Exponential-smoothing factor, 0..1.
   *   higher  -> snappier, more responsive, more jittery
   *   lower   -> smoother, calmer, laggier
   */
  emaAlpha: number;
  /**
   * Output scale. Multiplies the normalized velocity into a friendly range.
   * Local (palm-relative) finger motion is smaller than whole-hand motion, so
   * this is larger than you might expect. With the defaults, vigorously running
   * the two fingers lands roughly in the 40-100 area. Raise to make the game
   * more sensitive (less finger motion needed to run fast).
   */
  scale: number;
  /** Ignore frames closer together than this (ms) to avoid divide-by-tiny-dt. */
  minDtMs: number;
}

export const DEFAULT_TUNING: IntensityTuning = {
  fingertipIndices: [8, 12],
  emaAlpha: 0.4,
  scale: 140,
  minDtMs: 8,
};

// Landmarks defining the hand-local reference frame.
const WRIST = 0;
const MIDDLE_MCP = 9; // middle-finger knuckle

export class MovementIntensity {
  private prevLocal: Landmark[] | null = null;
  private prevTime = 0;
  private ema = 0;

  constructor(private readonly tuning: IntensityTuning = DEFAULT_TUNING) {}

  /** Current smoothed intensity (same value the last `update` returned). */
  get value(): number {
    return this.ema;
  }

  /** Clear all history — call when (re)starting a round. */
  reset(): void {
    this.prevLocal = null;
    this.prevTime = 0;
    this.ema = 0;
  }

  /**
   * Feed one frame. Pass `null` when no hand is detected — the metric then
   * decays toward 0 so the on-screen runner coasts to a stop instead of
   * freezing at its last value.
   */
  update(landmarks: Landmark[] | null, timeMs: number): number {
    if (!landmarks || landmarks.length < 21) {
      this.ema *= 1 - this.tuning.emaAlpha; // decay toward 0
      this.prevLocal = null;
      return this.ema;
    }

    const dt = this.prevTime ? timeMs - this.prevTime : 0;
    this.prevTime = timeMs;

    // Project the tracked fingertips into the hand-local frame for this frame.
    const local = this.toLocal(landmarks);

    // First frame (or frames too close together): record baseline, no velocity.
    if (!this.prevLocal || dt < this.tuning.minDtMs) {
      this.prevLocal = local;
      return this.ema;
    }

    // Average movement of the fingertips *within the hand frame* since last
    // frame. Whole-hand translation/rotation/zoom cancels out here, so only
    // genuine finger articulation contributes.
    let sum = 0;
    for (let i = 0; i < local.length; i++) {
      sum += distance(local[i], this.prevLocal[i]);
    }
    const avgDisplacement = sum / local.length;

    // Convert to per-second velocity, scale to range.
    const velocity = avgDisplacement / (dt / 1000);
    const raw = velocity * this.tuning.scale;

    // Exponential moving average.
    this.ema += this.tuning.emaAlpha * (raw - this.ema);
    this.prevLocal = local;
    return this.ema;
  }

  /**
   * Express the tracked fingertips in a hand-local frame: origin at the wrist,
   * "up" axis pointing to the middle knuckle, normalized by hand size. The
   * result is invariant to where the hand is, how it's rotated, and how close
   * it is to the camera — it only changes when the fingers themselves move.
   */
  private toLocal(landmarks: Landmark[]): Landmark[] {
    const origin = landmarks[WRIST];
    const ax = landmarks[MIDDLE_MCP].x - origin.x;
    const ay = landmarks[MIDDLE_MCP].y - origin.y;
    const handScale = Math.hypot(ax, ay) || 1e-3;

    // Unit "up" axis (wrist -> middle knuckle) and its perpendicular.
    const ux = ax / handScale;
    const uy = ay / handScale;
    const px = -uy; // perpendicular ("sideways across the palm")
    const py = ux;

    return this.tuning.fingertipIndices.map((i) => {
      const dx = landmarks[i].x - origin.x;
      const dy = landmarks[i].y - origin.y;
      return {
        x: (dx * px + dy * py) / handScale, // sideways component
        y: (dx * ux + dy * uy) / handScale, // along-finger component
      };
    });
  }
}

function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
