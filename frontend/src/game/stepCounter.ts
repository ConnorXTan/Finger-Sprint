/**
 * ============================================================================
 *  STEP COUNTER   (turns the two fingers "walking" into a running cadence)
 * ============================================================================
 *
 * Instead of measuring raw finger velocity, this detects actual *steps*: in a
 * walking motion the index and middle fingers alternate which one is in front.
 * Every time the front finger swaps (the fingertips pass each other) we count
 * one step — exactly like planting alternate feet.
 *
 * The "who's in front" signal is the difference between the two legs' swing
 * (from `fingerLegs.ts`): both swings are already baseline-centered and
 * hand-relative, so:
 *   s > 0  -> index finger leads
 *   s < 0  -> middle finger leads
 *   s = 0  -> fingers level / passing each other  (a step happens here)
 * Because it's built on the hand-local frame, moving / rotating / zooming the
 * whole hand can't fake a step — you have to genuinely alternate the fingers.
 *
 * Output (`value`) is a smoothed cadence — steps per second scaled into the
 * same range the server expects for "movement intensity" — so faster, steadier
 * stepping makes the runner sprint, and stopping lets it coast to a halt.
 */

import type { LegPose } from "./fingerLegs";

export interface StepTuning {
  /**
   * How decisively a finger must lead before it counts as "in front". Creates
   * a dead-band around the crossover so tiny jitter near level doesn't spam
   * steps (hysteresis). In leg-swing units (see fingerLegs.ts, ~±1.3).
   */
  leadThreshold: number;
  /** Maps cadence (steps/sec) into the server's movement-value range. */
  cadenceScale: number;
  /** Smoothing for the cadence estimate (0..1, higher = snappier). */
  emaAlpha: number;
  /** Cadence seeded on the very first step so you get instant feedback. */
  seedCadence: number;
  /** Ignore implied rates above this (steps/sec) to reject double-trigger spikes. */
  maxRate: number;
  /** Once stepping pauses this long (ms), cadence starts decaying toward 0. */
  idleMs: number;
  /** How fast cadence bleeds away per second once you've stopped stepping. */
  idleDecayPerSec: number;
}

export const DEFAULT_STEP_TUNING: StepTuning = {
  leadThreshold: 0.18,
  cadenceScale: 22,
  emaAlpha: 0.35,
  seedCadence: 2,
  maxRate: 10,
  idleMs: 250,
  idleDecayPerSec: 2,
};

export class StepCounter {
  /** Which finger is currently in front: +1 index, -1 middle, 0 unknown. */
  private front = 0;
  private steps = 0;
  private cadence = 0; // steps per second (smoothed)
  private lastStepMs = 0;
  private prevMs = 0;

  constructor(private readonly tuning: StepTuning = DEFAULT_STEP_TUNING) {}

  /** Smoothed movement value to send to the server / show on the HUD. */
  get value(): number {
    return this.cadence * this.tuning.cadenceScale;
  }

  /** Total steps taken this round. */
  get totalSteps(): number {
    return this.steps;
  }

  /** Current smoothed cadence in steps per second. */
  get stepsPerSecond(): number {
    return this.cadence;
  }

  /** Clear all history — call when (re)starting a round. */
  reset(): void {
    this.front = 0;
    this.steps = 0;
    this.cadence = 0;
    this.lastStepMs = 0;
    this.prevMs = 0;
  }

  /**
   * Feed one frame's leg pose. Pass `null` when no hand is detected — the
   * cadence then decays toward 0 so the runner coasts to a stop. Returns the
   * current movement value (same as `value`).
   */
  update(legPose: LegPose | null, timeMs: number): number {
    const dt = this.prevMs ? timeMs - this.prevMs : 0;
    this.prevMs = timeMs;

    if (legPose) {
      const s = legPose.index - legPose.middle; // >0 index leads, <0 middle leads
      if (s > this.tuning.leadThreshold && this.front <= 0) {
        if (this.front < 0) this.registerStep(timeMs); // genuine front<->back swap
        this.front = 1;
      } else if (s < -this.tuning.leadThreshold && this.front >= 0) {
        if (this.front > 0) this.registerStep(timeMs);
        this.front = -1;
      }
    } else {
      this.front = 0; // re-baseline cleanly when the hand reappears
    }

    // Bleed cadence away only once stepping has clearly paused, so a steady
    // walk holds a stable speed instead of sawtoothing between steps.
    if (dt > 0 && this.cadence > 0) {
      const sinceStep = this.lastStepMs ? timeMs - this.lastStepMs : Infinity;
      const expectedInterval = 1000 / Math.max(this.cadence, 0.001);
      if (sinceStep > Math.max(this.tuning.idleMs, 1.6 * expectedInterval)) {
        this.cadence *= Math.exp(-this.tuning.idleDecayPerSec * (dt / 1000));
      }
    }

    return this.value;
  }

  private registerStep(timeMs: number): void {
    this.steps++;
    if (this.lastStepMs) {
      const interval = (timeMs - this.lastStepMs) / 1000;
      if (interval > 0) {
        const inst = Math.min(this.tuning.maxRate, 1 / interval);
        this.cadence += this.tuning.emaAlpha * (inst - this.cadence);
      }
    } else {
      this.cadence = Math.max(this.cadence, this.tuning.seedCadence);
    }
    this.lastStepMs = timeMs;
  }
}
