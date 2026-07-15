/**
 * ============================================================================
 *  STEP COUNTER   (flat count of genuine fingertip crossings)
 * ============================================================================
 *
 * A "step" has exactly one definition: the POINTER/INDEX fingertip (landmark 8)
 * and the MIDDLE fingertip (landmark 12) physically pass each other. We compare
 * the two tips' RAW reach along the hand axis (`indexReach` / `middleReach`
 * from fingerLegs.ts — no baselines, no smoothing):
 *
 *   gap = indexReach - middleReach
 *     gap > +crossMargin  ->  pointer tip is clearly in front
 *     gap < -crossMargin  ->  middle tip is clearly in front
 *     otherwise           ->  neutral zone: tips are level, nothing counts
 *
 * A step is registered ONLY when the leading tip flips from one finger to the
 * other — i.e. the tips crossed AND cleared the margin on the far side. The
 * ±crossMargin band is the "clear boundary": wiggling one finger up and down
 * without its tip actually passing the other tip never flips the leader, so it
 * can never count as steps. Whole-hand motion can't either, because reach is
 * measured in the hand-local frame.
 *
 * The output is the FLAT total number of steps this round — no cadence, no
 * rates, no decay. One crossing = one step, always.
 */

import type { LegPose } from "./fingerLegs";

export interface StepTuning {
  /**
   * How far past the other tip a fingertip must reach (in hand-scale units,
   * i.e. fractions of the wrist->knuckle distance) before it counts as clearly
   * in front. This dead-band around the crossover is the boundary between "the
   * pointer leads" and "the middle leads"; tracker jitter inside it is ignored.
   */
  crossMargin: number;
  /** Minimum ms between counted steps — rejects single-frame tracker flicker. */
  minStepIntervalMs: number;
}

export const DEFAULT_STEP_TUNING: StepTuning = {
  crossMargin: 0.06,
  minStepIntervalMs: 80,
};

export class StepCounter {
  /** Which tip clearly leads: +1 pointer/index, -1 middle, 0 unknown/level. */
  private leader = 0;
  private steps = 0;
  private lastStepMs = 0;

  constructor(private readonly tuning: StepTuning = DEFAULT_STEP_TUNING) {}

  /** Flat total steps this round (the only output — there is no rate). */
  get totalSteps(): number {
    return this.steps;
  }

  /** Clear all history — call when (re)starting a round. */
  reset(): void {
    this.leader = 0;
    this.steps = 0;
    this.lastStepMs = 0;
  }

  /**
   * Feed one frame's leg pose (`null` when no hand is detected). Returns the
   * flat total step count.
   */
  update(legPose: LegPose | null, timeMs: number): number {
    if (!legPose) {
      this.leader = 0; // re-acquire the leader cleanly when the hand returns
      return this.steps;
    }

    const gap = legPose.indexReach - legPose.middleReach;
    if (Math.abs(gap) < this.tuning.crossMargin) return this.steps; // tips level

    const leader = gap > 0 ? 1 : -1;
    if (this.leader === 0) {
      // First clear leader after (re)start or hand loss — a position, not a step.
      this.leader = leader;
    } else if (leader !== this.leader) {
      // The tips genuinely crossed and cleared the margin on the other side.
      this.leader = leader;
      if (!this.lastStepMs || timeMs - this.lastStepMs >= this.tuning.minStepIntervalMs) {
        this.steps++;
        this.lastStepMs = timeMs;
      }
    }
    return this.steps;
  }
}
