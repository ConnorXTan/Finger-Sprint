import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateSessionResponse,
  EndSessionResponse,
  StateMessage,
} from "@finger-sprint/shared";
import { MOVEMENT_TICK_MS } from "../config";
import { createHandTracker, type HandTracker } from "./handTracker";
import type { Landmark } from "./movementIntensity";
import { FingerLegTracker, type LegPose } from "./fingerLegs";
import { StepCounter } from "./stepCounter";
import { useWebcam } from "./useWebcam";
import { createSession, endSession, GameConnection, submitScore } from "../net/gameClient";

/**
 * Phases of the client experience:
 *   idle      - nothing started
 *   loading   - asking for the webcam + downloading the MediaPipe model
 *   ready     - tracking live; shows the intensity number (calibration screen)
 *   playing   - a round is in progress; metrics stream to the server
 *   finished  - round over; final score available
 *   error     - webcam/model failure (see `error`)
 */
export type GamePhase = "idle" | "loading" | "ready" | "playing" | "finished" | "error";

/**
 * The whole client engine in one hook. Owns the tracking loop, the fixed-rate
 * metric sender, and the lifecycle (prepare -> round -> finish -> submit).
 *
 * Smooth per-frame data (intensity, landmarks, latest game state) is exposed via
 * refs so the canvas renderer can read it every animation frame without causing
 * React re-renders. Coarse data for the DOM (phase, displayed intensity, the
 * latest state for the HUD) is exposed as React state.
 */
export function useFingerSprint() {
  const { videoRef, status: webcamStatus, error: webcamError, start: startWebcam, stop: stopWebcam } =
    useWebcam();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(0);
  const [steps, setSteps] = useState(0);
  const [stepsPerMinute, setStepsPerMinute] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  const [gameState, setGameState] = useState<StateMessage | null>(null);
  const [session, setSession] = useState<CreateSessionResponse | null>(null);
  const [result, setResult] = useState<EndSessionResponse | null>(null);

  // Per-frame data for the renderer (no re-render on update).
  const intensityRef = useRef(0);
  const stepsRef = useRef(0);
  const cadenceRef = useRef(0); // smoothed steps per second
  const landmarksRef = useRef<Landmark[] | null>(null);
  const legPoseRef = useRef<LegPose | null>(null);
  const gameStateRef = useRef<StateMessage | null>(null);

  // Long-lived engine pieces.
  const trackerRef = useRef<HandTracker | null>(null);
  const legTrackerRef = useRef(new FingerLegTracker());
  const stepCounterRef = useRef(new StepCounter());
  const connectionRef = useRef<GameConnection | null>(null);

  // Loop handles.
  const rafRef = useRef<number | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishingRef = useRef(false);

  /** rAF loop: detect hand -> update intensity -> stash for the renderer. */
  const runTrackingLoop = useCallback(() => {
    const loop = (timeMs: number) => {
      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (tracker && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const { landmarks } = tracker.detect(video, timeMs);
          landmarksRef.current = landmarks;
          // Index/middle finger swing drives both the runner's legs and the
          // step detector; the step cadence is the movement value we send.
          const legPose = legTrackerRef.current.update(landmarks);
          legPoseRef.current = legPose;
          intensityRef.current = stepCounterRef.current.update(legPose, timeMs);
          stepsRef.current = stepCounterRef.current.totalSteps;
          cadenceRef.current = stepCounterRef.current.stepsPerSecond;
        } catch {
          // A transient detect error shouldn't kill the loop.
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [videoRef]);

  /** Fixed-rate loop: surface intensity to the UI and stream it to the server. */
  const runSendLoop = useCallback(() => {
    sendTimerRef.current = setInterval(() => {
      const value = intensityRef.current;
      setIntensity(value);
      setSteps(stepsRef.current);
      setStepsPerMinute(Math.round(cadenceRef.current * 60));
      setHandDetected(landmarksRef.current != null);
      connectionRef.current?.sendMovement(value);
    }, MOVEMENT_TICK_MS);
  }, []);

  /** Acquire the webcam and load the model. Moves idle -> loading -> ready. */
  const prepare = useCallback(async () => {
    setError(null);
    setPhase("loading");
    const camOk = await startWebcam();
    if (!camOk) {
      setPhase("error");
      return;
    }
    try {
      if (!trackerRef.current) trackerRef.current = await createHandTracker();
    } catch (e) {
      setError(`Could not load the hand-tracking model. ${(e as Error).message ?? ""}`.trim());
      setPhase("error");
      return;
    }
    legTrackerRef.current.reset();
    stepCounterRef.current.reset();
    runTrackingLoop();
    runSendLoop();
    setPhase("ready");
  }, [startWebcam, runTrackingLoop, runSendLoop]);

  /** Finalize the round once the server reports `finished`. */
  const finishRound = useCallback(async (sessionId: string) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    connectionRef.current?.close();
    connectionRef.current = null;
    try {
      const final = await endSession(sessionId);
      setResult(final);
    } catch (e) {
      setError((e as Error).message);
    }
    setPhase("finished");
  }, []);

  /** Create a session, open the socket, begin a round. */
  const startRound = useCallback(async () => {
    if (phase !== "ready") return;
    setError(null);
    setResult(null);
    setGameState(null);
    gameStateRef.current = null;
    finishingRef.current = false;
    legTrackerRef.current.reset();
    stepCounterRef.current.reset();
    try {
      const created = await createSession();
      setSession(created);
      const conn = new GameConnection(created.sessionId, (state) => {
        gameStateRef.current = state;
        setGameState(state);
        if (state.finished) void finishRound(created.sessionId);
      });
      await conn.connect();
      connectionRef.current = conn;
      setPhase("playing");
    } catch (e) {
      setError(`Could not start the round. ${(e as Error).message ?? ""}`.trim());
      setPhase("ready");
    }
  }, [phase, finishRound]);

  /** Submit a name for the finished round's score. */
  const submitName = useCallback(
    async (name: string) => {
      if (!session) throw new Error("no session");
      const res = await submitScore(session.sessionId, name);
      return res.entry;
    },
    [session],
  );

  /** Return to the calibration screen, keeping the webcam + tracker warm. */
  const playAgain = useCallback(() => {
    setResult(null);
    setGameState(null);
    gameStateRef.current = null;
    finishingRef.current = false;
    legTrackerRef.current.reset();
    stepCounterRef.current.reset();
    setPhase("ready");
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
      connectionRef.current?.close();
      trackerRef.current?.close();
      stopWebcam();
    };
  }, [stopWebcam]);

  return {
    // lifecycle
    phase,
    prepare,
    startRound,
    submitName,
    playAgain,
    // data for the UI
    intensity,
    steps,
    stepsPerMinute,
    handDetected,
    gameState,
    session,
    result,
    error,
    webcamStatus,
    webcamError,
    // refs for the canvas renderer
    videoRef,
    intensityRef,
    landmarksRef,
    legPoseRef,
    gameStateRef,
  };
}

export type FingerSprintEngine = ReturnType<typeof useFingerSprint>;
