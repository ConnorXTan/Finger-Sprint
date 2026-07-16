// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { StateMessage } from "@finger-sprint/shared";
import { Hud, paceFill, PACE_SOFT_MAX } from "./Hud";

// Vitest runs without injected globals, so RTL's auto-cleanup never registers.
afterEach(cleanup);

/**
 * CRITICAL regression test (eng review iron rule): the HUD restyle modifies
 * working behavior — all five fields (time, score, distance, steps, combo)
 * must render from a StateMessage.
 */

const state: StateMessage = {
  type: "state",
  position: 0.42,
  speed: 38,
  distance: 312,
  steps: 184,
  score: 1240,
  multiplier: 3.1,
  timeRemaining: 42_000,
  finished: false,
};

describe("Hud (CRITICAL five-field regression)", () => {
  it("renders time, score, distance, steps, and combo from a StateMessage", () => {
    render(<Hud state={state} trackLength={500} />);
    expect(screen.getByText("0:42")).toBeTruthy(); // time
    expect(screen.getByText("1,240")).toBeTruthy(); // score (the hero)
    expect(screen.getByText("312m / 500m")).toBeTruthy(); // distance
    expect(screen.getByText("184 steps")).toBeTruthy(); // steps
    expect(screen.getByText("×3.1")).toBeTruthy(); // combo stamp
  });

  it("zeroes the HUD before the first server state arrives (state: null)", () => {
    const { container } = render(<Hud state={null} trackLength={500} />);
    expect(screen.getByText("0:00")).toBeTruthy();
    expect(container.querySelector(".hud__score .hud__numeral")?.textContent).toBe("0");
    expect(screen.getByText("0m / 500m")).toBeTruthy();
    expect(screen.getByText("0 steps")).toBeTruthy();
  });

  it("hides the combo stamp at multiplier 1 (no red without a streak)", () => {
    render(<Hud state={{ ...state, multiplier: 1 }} trackLength={500} />);
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("shows the disconnect notice when the socket drops mid-round", () => {
    render(<Hud state={state} trackLength={500} disconnected />);
    expect(screen.getByText(/lost the thread/)).toBeTruthy();
  });

  it("mirrors time and score into an aria-live region for screen readers", () => {
    const { container } = render(<Hud state={state} trackLength={500} />);
    const live = container.querySelector("[aria-live=polite]");
    expect(live?.textContent).toContain("score 1240");
  });
});

describe("paceFill", () => {
  it("clamps to [0, 1] around the soft max", () => {
    expect(paceFill(0)).toBe(0);
    expect(paceFill(PACE_SOFT_MAX / 2)).toBe(0.5);
    expect(paceFill(PACE_SOFT_MAX)).toBe(1);
    expect(paceFill(PACE_SOFT_MAX * 2)).toBe(1);
    expect(paceFill(-5)).toBe(0);
  });
});
