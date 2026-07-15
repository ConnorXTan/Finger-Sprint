/**
 * ============================================================================
 *  FINGER -> LEG POSE   (drives the on-screen runner's two legs directly)
 * ============================================================================
 *
 * The runner has two legs. This module reads exactly two fingertips — the
 * POINTER/INDEX fingertip (MediaPipe landmark 8) and the MIDDLE fingertip
 * (MediaPipe landmark 12) — and reports, per frame:
 *
 *   1. `index` / `middle` — a baseline-centered "swing" (~-1..+1) for ANIMATING
 *      the cartoon legs. Centered on a slow per-finger baseline so the legs
 *      look symmetric despite the middle finger being naturally longer.
 *      ANIMATION ONLY — never use these for step detection: the baseline makes
 *      a single wiggling finger oscillate around 0, which reads like crossing.
 *   2. `indexReach` / `middleReach` — the RAW reach of each fingertip along the
 *      hand axis (wrist -> middle knuckle), in hand-scale units, no baseline.
 *      These are the ground truth of where the tips actually are; the step
 *      counter compares them directly to detect the tips physically crossing.
 *
 * Everything is measured *relative to the hand* (origin at the wrist, axis to
 * the middle knuckle, normalized by that distance), so moving/rotating/zooming
 * the whole hand changes neither swings nor reaches — only real finger motion.
 */

import type { Landmark } from "./handTracker";

/** Pointer/index fingertip — MediaPipe hand landmark 8. */
export const INDEX_TIP = 8;
/** Middle fingertip — MediaPipe hand landmark 12. */
export const MIDDLE_TIP = 12;

export interface LegPose {
  /** Index-finger leg swing, roughly -1..+1 (baseline-centered, animation only). */
  index: number;
  /** Middle-finger leg swing, roughly -1..+1 (baseline-centered, animation only). */
  middle: number;
  /** Raw index fingertip reach along the hand axis, in hand-scale units. */
  indexReach: number;
  /** Raw middle fingertip reach along the hand axis, in hand-scale units. */
  middleReach: number;
}

const WRIST = 0;
const MIDDLE_MCP = 9;

export class FingerLegTracker {
  private baseIndex = 0;
  private baseMiddle = 0;
  private init = false;

  /**
   * @param baselineAlpha How fast the neutral baseline drifts (small = slow).
   *   Must be well below the stride frequency so steps aren't flattened.
   * @param swingScale    Maps small along-axis deltas into the -1..1 leg range.
   * @param clampTo       Hard limit on swing magnitude.
   */
  constructor(
    private readonly baselineAlpha = 0.02,
    private readonly swingScale = 6,
    private readonly clampTo = 1.3,
  ) {}

  /** Clear baseline + history — call when (re)starting a round. */
  reset(): void {
    this.init = false;
    this.baseIndex = 0;
    this.baseMiddle = 0;
  }

  /**
   * Feed one frame. Returns the per-leg swing, or null when no hand is
   * detected (renderer then falls back to a gentle idle animation).
   */
  update(landmarks: Landmark[] | null): LegPose | null {
    if (!landmarks || landmarks.length < 21) {
      this.init = false; // re-baseline next time a hand reappears
      return null;
    }

    const origin = landmarks[WRIST];
    const ax = landmarks[MIDDLE_MCP].x - origin.x;
    const ay = landmarks[MIDDLE_MCP].y - origin.y;
    const handScale = Math.hypot(ax, ay) || 1e-3;
    const ux = ax / handScale;
    const uy = ay / handScale;

    // How far each fingertip reaches along the hand axis, in hand units.
    const along = (i: number) =>
      ((landmarks[i].x - origin.x) * ux + (landmarks[i].y - origin.y) * uy) / handScale;
    const eIndex = along(INDEX_TIP);
    const eMiddle = along(MIDDLE_TIP);

    if (!this.init) {
      this.baseIndex = eIndex;
      this.baseMiddle = eMiddle;
      this.init = true;
    } else {
      this.baseIndex += this.baselineAlpha * (eIndex - this.baseIndex);
      this.baseMiddle += this.baselineAlpha * (eMiddle - this.baseMiddle);
    }

    return {
      index: clamp((eIndex - this.baseIndex) * this.swingScale, -this.clampTo, this.clampTo),
      middle: clamp((eMiddle - this.baseMiddle) * this.swingScale, -this.clampTo, this.clampTo),
      indexReach: eIndex,
      middleReach: eMiddle,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
