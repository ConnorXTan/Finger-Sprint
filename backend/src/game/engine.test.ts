import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateMessage } from "@finger-sprint/shared";
import { GameSession } from "./engine";
import { config } from "../config";

const G = config.game;

/** Start a session under fake timers and return a handle to drive it. */
function startSession() {
  const states: StateMessage[] = [];
  const session = new GameSession("test-session");
  session.start((s) => states.push(s), Date.now());
  return {
    session,
    states,
    /** Advance the authoritative clock by whole ticks. */
    ticks(n: number) {
      vi.advanceTimersByTime(n * G.tickMs);
    },
    last() {
      return states[states.length - 1];
    },
  };
}

describe("GameSession — flat step-driven movement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances exactly distancePerStep per accepted step", () => {
    const h = startSession();
    h.session.applySteps(3);
    h.ticks(1);
    expect(h.last().steps).toBe(3);
    expect(h.last().distance).toBe(3 * G.distancePerStep);
    h.session.dispose();
  });

  it("advances by the delta between cumulative totals (self-healing)", () => {
    const h = startSession();
    h.session.applySteps(2);
    h.ticks(1);
    h.session.applySteps(5); // total, not delta => +3
    h.ticks(1);
    expect(h.last().steps).toBe(5);
    expect(h.last().distance).toBe(5 * G.distancePerStep);
    h.session.dispose();
  });

  it("ignores out-of-order (decreasing) totals instead of granting steps", () => {
    const h = startSession();
    h.session.applySteps(4);
    h.ticks(1);
    h.session.applySteps(2); // stale message from the past
    h.ticks(1);
    expect(h.last().steps).toBe(4);
    h.session.dispose();
  });

  it("rate-caps impossible bursts and discards the excess", () => {
    const h = startSession();
    h.session.applySteps(1000); // cheat: +1000 steps in one message
    h.ticks(10); // 1 second of ticks
    // The token bucket accepts at most one burst ceiling; the rest is dropped
    // on the tick it arrived (never banked for later payout).
    expect(h.last().steps).toBeLessThanOrEqual(G.maxStepsPerSecond);
    expect(h.last().distance).toBe(h.last().steps * G.distancePerStep);
    h.session.dispose();
  });

  it("accepts a legitimate burst batched by a frame hiccup", () => {
    const h = startSession();
    // ~300ms browser stall: 3 real crossings arrive in a single message.
    h.session.applySteps(3);
    h.ticks(1);
    expect(h.last().steps).toBe(3);
    h.session.dispose();
  });

  it("gains no distance while no steps are reported", () => {
    const h = startSession();
    h.session.applySteps(2);
    h.ticks(1);
    const distance = h.last().distance;
    h.ticks(20); // 2 idle seconds
    expect(h.last().distance).toBe(distance);
    expect(h.last().finished).toBe(false);
    h.session.dispose();
  });

  it("finishes when accepted steps cover the track", () => {
    const h = startSession();
    const stepsToFinish = Math.ceil(G.trackLength / G.distancePerStep);
    let total = 0;
    // Feed one step per tick (well under the rate cap) until the track is done.
    for (let i = 0; i < stepsToFinish + 5 && !h.last()?.finished; i++) {
      total += 1;
      h.session.applySteps(total);
      h.ticks(1);
    }
    expect(h.last().finished).toBe(true);
    expect(h.last().distance).toBe(G.trackLength);
    expect(h.last().score).toBeGreaterThan(0);
    h.session.dispose();
  });
});
