import { describe, expect, it } from "vitest";
import { FingerLegTracker } from "./fingerLegs";
import { StepCounter } from "./stepCounter";
import type { Landmark } from "./handTracker";

/**
 * Synthetic hand: wrist at (0.5, 0.9), middle knuckle at (0.5, 0.7) — hand
 * axis points up, hand scale 0.2. A fingertip at "reach r" sits at
 * y = 0.9 - 0.2 * r. Typical extended reaches: index ~1.55, middle ~1.7
 * (the middle finger is naturally longer).
 */
function makeHand(indexReach: number, middleReach: number, offsetX = 0, offsetY = 0): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5 + offsetX, y: 0.9 + offsetY }));
  lm[9] = { x: 0.5 + offsetX, y: 0.7 + offsetY }; // middle knuckle
  lm[8] = { x: 0.5 + offsetX, y: 0.9 - 0.2 * indexReach + offsetY }; // index tip
  lm[12] = { x: 0.5 + offsetX, y: 0.9 - 0.2 * middleReach + offsetY }; // middle tip
  return lm;
}

/** Run `frameCount` frames at ~30fps through legs -> counter, return steps. */
function runFrames(frames: (i: number) => Landmark[] | null, frameCount: number): number {
  const legs = new FingerLegTracker();
  const counter = new StepCounter();
  let t = 0;
  for (let i = 0; i < frameCount; i++) {
    t += 33;
    counter.update(legs.update(frames(i)), t);
  }
  return counter.totalSteps;
}

describe("StepCounter — steps only on genuine fingertip crossings", () => {
  it("counts zero when one finger wiggles without its tip passing the other", () => {
    // Index oscillates reach 1.2..1.6; middle fixed at 1.7 — tips never cross.
    // This was the original bug: baseline-relative detection counted these.
    const steps = runFrames((i) => makeHand(1.4 + 0.2 * Math.sin(i * 0.4), 1.7), 300);
    expect(steps).toBe(0);
  });

  it("counts one step per genuine crossing while walking", () => {
    // Tips cross in antiphase (gap swings ±0.35) at 1 Hz => 2 crossings/sec.
    // 150 frames at 30fps = 5s => ~10 crossings (first acquisition isn't a step).
    const steps = runFrames((i) => {
      const phase = (i / 30) * Math.PI * 2;
      return makeHand(1.55 + 0.35 * Math.sin(phase), 1.55 - 0.35 * Math.sin(phase));
    }, 150);
    expect(steps).toBeGreaterThanOrEqual(8);
    expect(steps).toBeLessThanOrEqual(10);
  });

  it("counts zero when the whole hand moves but fingers stay rigid", () => {
    const steps = runFrames(
      (i) => makeHand(1.55, 1.7, 0.3 * Math.sin(i * 0.3), 0.05 * Math.cos(i * 0.3)),
      300,
    );
    expect(steps).toBe(0);
  });

  it("ignores jitter inside the crossMargin dead band", () => {
    // Tips hover level, gap jitters ±0.03 (< 0.06 margin) around the crossover.
    const steps = runFrames(
      (i) => makeHand(1.6 + 0.03 * Math.sin(i * 1.7), 1.6 - 0.03 * Math.sin(i * 1.7)),
      300,
    );
    expect(steps).toBe(0);
  });

  it("does not fabricate a step when the hand drops out and reappears", () => {
    const steps = runFrames((i) => {
      if (i >= 50 && i < 70) return null; // hand lost
      return makeHand(1.9, 1.4); // index stays in front the whole time
    }, 100);
    expect(steps).toBe(0);
  });

  it("resets the flat count for a new round", () => {
    const legs = new FingerLegTracker();
    const counter = new StepCounter();
    let t = 0;
    for (let i = 0; i < 60; i++) {
      t += 33;
      const phase = (i / 30) * Math.PI * 2;
      counter.update(legs.update(makeHand(1.55 + 0.35 * Math.sin(phase), 1.55 - 0.35 * Math.sin(phase))), t);
    }
    expect(counter.totalSteps).toBeGreaterThan(0);
    counter.reset();
    expect(counter.totalSteps).toBe(0);
  });
});
