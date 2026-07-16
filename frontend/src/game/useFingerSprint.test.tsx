// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: ISSUE-010 — disconnect race cluster (adversarial review #1/#2/#3)
// Found by /qa on 2026-07-16
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-16.md

let capturedOnState: ((state: unknown) => void) | undefined;
let capturedOnClose: (() => void) | undefined;
let connectShouldFail = false;

vi.mock("../net/gameClient", () => ({
  createSession: vi.fn().mockResolvedValue({
    sessionId: "s1",
    durationMs: 60_000,
    trackLength: 1000,
    serverTimeMs: 0,
  }),
  endSession: vi.fn().mockResolvedValue({
    sessionId: "s1",
    score: 42,
    distance: 10,
    finished: true,
    rank: 1,
    durationMs: 60_000,
  }),
  submitScore: vi.fn(),
  // NOTE: must be a `function` (not arrow) — the hook constructs it with `new`.
  GameConnection: vi.fn().mockImplementation(function (
    _id: string,
    onState: (s: unknown) => void,
    onClose: () => void,
  ) {
    capturedOnState = onState;
    capturedOnClose = onClose;
    return {
      connect: connectShouldFail
        ? vi.fn().mockRejectedValue(new Error("WebSocket connection failed"))
        : vi.fn().mockResolvedValue(undefined),
      sendSteps: vi.fn(),
      close: vi.fn(),
    };
  }),
}));
// Stable identity across renders, like the real hook's useCallback returns —
// unstable mocks here made the unmount-teardown effect fire between renders.
const webcamMock = {
  videoRef: { current: null },
  status: "playing",
  error: null,
  start: vi.fn().mockResolvedValue(true),
  stop: vi.fn(),
};
vi.mock("./useWebcam", () => ({ useWebcam: () => webcamMock }));
vi.mock("./handTracker", () => ({
  createHandTracker: vi
    .fn()
    .mockResolvedValue({ detect: () => ({ landmarks: null }), close: vi.fn() }),
}));

import { DISCONNECT_NOTICE_MS, useFingerSprint } from "./useFingerSprint";
import { endSession } from "../net/gameClient";

async function startPlaying() {
  const hook = renderHook(() => useFingerSprint());
  await act(async () => {
    await hook.result.current.prepare();
  });
  await act(async () => {
    await hook.result.current.startRound();
  });
  expect(hook.result.current.phase).toBe("playing");
  return hook;
}

describe("useFingerSprint disconnect handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectShouldFail = false;
    capturedOnState = undefined;
    capturedOnClose = undefined;
    vi.mocked(endSession).mockClear();
  });

  it("shows the notice then finalizes after an abnormal mid-round close", async () => {
    const { result } = await startPlaying();
    act(() => capturedOnClose?.());
    expect(result.current.disconnected).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(DISCONNECT_NOTICE_MS);
      await Promise.resolve();
    });
    expect(endSession).toHaveBeenCalledWith("s1");
    expect(result.current.phase).toBe("finished");
    expect(result.current.disconnected).toBe(false); // cleared on finalize
  });

  it("ignores the close that follows a normal server-driven finish", async () => {
    const { result } = await startPlaying();
    await act(async () => {
      capturedOnState?.({
        type: "state",
        position: 1,
        speed: 0,
        distance: 1000,
        steps: 500,
        score: 42,
        multiplier: 1,
        timeRemaining: 0,
        finished: true,
      });
      await Promise.resolve();
    });
    act(() => capturedOnClose?.()); // teardown close after finishing
    expect(result.current.disconnected).toBe(false);
    expect(result.current.phase).toBe("finished");
  });

  it("routes endSession failure to the error screen, never a fabricated result", async () => {
    const { result } = await startPlaying();
    vi.mocked(endSession).mockRejectedValueOnce(new Error("backend gone"));
    act(() => capturedOnClose?.());
    await act(async () => {
      vi.advanceTimersByTime(DISCONNECT_NOTICE_MS);
      await Promise.resolve();
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.error).toContain("backend gone");
  });

  it("returns to ready on connect failure without latching disconnected", async () => {
    connectShouldFail = true;
    const hook = renderHook(() => useFingerSprint());
    await act(async () => {
      await hook.result.current.prepare();
    });
    await act(async () => {
      await hook.result.current.startRound();
    });
    expect(hook.result.current.phase).toBe("ready");
    expect(hook.result.current.disconnected).toBe(false);
    // No stray finalize fires later.
    await act(async () => {
      vi.advanceTimersByTime(DISCONNECT_NOTICE_MS * 2);
      await Promise.resolve();
    });
    expect(endSession).not.toHaveBeenCalled();
  });
});
