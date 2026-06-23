/**
 * ============================================================================
 *  FINGER -> LEG POSE   (drives the on-screen runner's two legs directly)
 * ============================================================================
 *
 * The runner has two legs. This module turns the INDEX finger (landmark 8) and
 * the MIDDLE finger (landmark 12) into a signed "swing" for each leg so the
 * cartoon's legs mirror your actual fingers frame by frame.
 *
 *   index finger  -> one leg
 *   middle finger -> the other leg
 *
 * Each swing is roughly -1..+1, where 0 is neutral, positive swings the leg one
 * way and negative the other. Like the intensity metric, it measures each
 * fingertip *relative to the hand* (so moving the whole hand doesn't move the
 * legs) — here using the fingertip's extension along the hand axis.
 *
 * To make swing centered at 0 regardless of how long your fingers are (the
 * middle finger naturally reaches further than the index), we track a slow
 * moving baseline per finger and report the deviation from it. The baseline
 * adapts far slower than a running cadence, so it removes the constant offset
 * without flattening the actual stride motion.
 */

import type { Landmark } from "./movementIntensity";

export interface LegPose {
  /** Index-finger leg swing, roughly -1..+1. */
  index: number;
  /** Middle-finger leg swing, roughly -1..+1. */
  middle: number;
}

const WRIST = 0;
const MIDDLE_MCP = 9;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;

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
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
