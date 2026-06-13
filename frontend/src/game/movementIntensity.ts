/**
 * ============================================================================
 *  MOVEMENT-INTENSITY METRIC  (the "how fast are the fingers moving" number)
 * ============================================================================
 *
 * This module is deliberately isolated and dependency-free so the sensitivity
 * can be tuned without touching tracking, networking, or rendering code.
 *
 * Input : the 21 MediaPipe hand landmarks for one video frame (normalized 0..1
 *         image coordinates), plus a timestamp.
 * Output: a single smoothed scalar — bigger = faster finger motion.
 *
 * How it works, step by step:
 *   1. Look only at the five fingertips (indices 4, 8, 12, 16, 20).
 *   2. Measure how far each fingertip moved since the previous frame.
 *   3. Divide by hand size (wrist -> middle-finger knuckle) so the metric is
 *      the same whether your hand is near or far from the camera.
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
  /** Which landmarks count as "fingertips". Default: the five fingertips. */
  fingertipIndices: number[];
  /**
   * Exponential-smoothing factor, 0..1.
   *   higher  -> snappier, more responsive, more jittery
   *   lower   -> smoother, calmer, laggier
   */
  emaAlpha: number;
  /**
   * Output scale. Multiplies the normalized velocity into a friendly range.
   * With the defaults, vigorous wiggling lands roughly in the 40-100 area.
   * Raise to make the game more sensitive (less motion needed to run fast).
   */
  scale: number;
  /** Ignore frames closer together than this (ms) to avoid divide-by-tiny-dt. */
  minDtMs: number;
}

export const DEFAULT_TUNING: IntensityTuning = {
  fingertipIndices: [4, 8, 12, 16, 20],
  emaAlpha: 0.4,
  scale: 90,
  minDtMs: 8,
};

export class MovementIntensity {
  private prev: Landmark[] | null = null;
  private prevTime = 0;
  private ema = 0;

  constructor(private readonly tuning: IntensityTuning = DEFAULT_TUNING) {}

  /** Current smoothed intensity (same value the last `update` returned). */
  get value(): number {
    return this.ema;
  }

  /** Clear all history — call when (re)starting a round. */
  reset(): void {
    this.prev = null;
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
      this.prev = null;
      return this.ema;
    }

    const dt = this.prevTime ? timeMs - this.prevTime : 0;
    this.prevTime = timeMs;

    // First frame (or frames too close together): record baseline, no velocity.
    if (!this.prev || dt < this.tuning.minDtMs) {
      this.prev = landmarks;
      return this.ema;
    }

    // Hand scale: wrist (0) -> middle-finger MCP knuckle (9). Used to normalize
    // away how close the hand is to the camera. Guard against zero.
    const handScale = distance(landmarks[0], landmarks[9]) || 1e-3;

    // Average fingertip displacement since last frame.
    let sum = 0;
    for (const i of this.tuning.fingertipIndices) {
      sum += distance(landmarks[i], this.prev[i]);
    }
    const avgDisplacement = sum / this.tuning.fingertipIndices.length;

    // Normalize by hand size, convert to per-second velocity, scale to range.
    const velocity = avgDisplacement / handScale / (dt / 1000);
    const raw = velocity * this.tuning.scale;

    // Exponential moving average.
    this.ema += this.tuning.emaAlpha * (raw - this.ema);
    this.prev = landmarks;
    return this.ema;
  }
}

function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
