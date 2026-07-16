import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateSessionResponse,
  EndSessionResponse,
  StateMessage,
} from "@finger-sprint/shared";
import { MOVEMENT_TICK_MS } from "../config";
import { createHandTracker, type HandTracker, type Landmark } from "./handTracker";
import { FingerLegTracker, type LegPose } from "./fingerLegs";
import { StepCounter } from "./stepCounter";
import { useWebcam } from "./useWebcam";
import { createSession, endSession, GameConnection, submitScore } from "../net/gameClient";

/**
 * Phases of the client experience:
 *   idle      - nothing started
 *   loading   - asking for the webcam + downloading the MediaPipe model
 *   ready     - tracking live; shows the live step count (calibration screen)
 *   playing   - a round is in progress; metrics stream to the server
 *   finished  - round over; final score available
 *   error     - webcam/model failure (see `error`)
 */
export type GamePhase = "idle" | "loading" | "ready" | "playing" | "finished" | "error";

/** How long the in-stage "lost the thread" notice shows before finalizing. */
export const DISCONNECT_NOTICE_MS = 1500;

/**
 * The whole client engine in one hook. Owns the tracking loop, the fixed-rate
 * metric sender, and the lifecycle (prepare -> round -> finish -> submit).
 *
 * Smooth per-frame data (landmarks, leg pose, latest game state) is exposed via
 * refs so the canvas renderer can read it every animation frame without causing
 * React re-renders. Coarse data for the DOM (phase, the step count, the latest
 * state for the HUD) is exposed as React state.
 */
export function useFingerSprint() {
  const { videoRef, status: webcamStatus, error: webcamError, start: startWebcam, stop: stopWebcam } =
    useWebcam();

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState(0);
  const [handDetected, setHandDetected] = useState(false);
  /** True while an abnormal mid-round socket close is being wrapped up. */
  const [disconnected, setDisconnected] = useState(false);
  const [gameState, setGameState] = useState<StateMessage | null>(null);
  const [session, setSession] = useState<CreateSessionResponse | null>(null);
  const [result, setResult] = useState<EndSessionResponse | null>(null);

  // Per-frame data for the renderer (no re-render on update).
  const stepsRef = useRef(0);
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
  /** Synchronous re-entrancy guard — `phase` closure state is stale on rapid double-clicks. */
  const startingRef = useRef(false);
  /** Pending disconnect-notice timer, cleared on any round transition. */
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** rAF loop: detect hand -> count steps -> stash for the renderer. */
  const runTrackingLoop = useCallback(() => {
    const loop = (timeMs: number) => {
      const tracker = trackerRef.current;
      const video = videoRef.current;
      if (tracker && video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const { landmarks } = tracker.detect(video, timeMs);
          landmarksRef.current = landmarks;
          // The leg pose animates the runner; its raw tip reaches feed the step
          // counter. The flat step total is the only movement value we send.
          const legPose = legTrackerRef.current.update(landmarks);
          legPoseRef.current = legPose;
          stepsRef.current = stepCounterRef.current.update(legPose, timeMs);
        } catch {
          // A transient detect error shouldn't kill the loop.
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [videoRef]);

  /** Fixed-rate loop: surface the step count to the UI and stream it to the server. */
  const runSendLoop = useCallback(() => {
    sendTimerRef.current = setInterval(() => {
      setSteps(stepsRef.current);
      setHandDetected(landmarksRef.current != null);
      connectionRef.current?.sendSteps(stepsRef.current);
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

  /** Finalize the round once the server reports `finished` (or the socket died). */
  const finishRound = useCallback(async (sessionId: string) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    connectionRef.current?.close();
    connectionRef.current = null;
    try {
      const final = await endSession(sessionId);
      setResult(final);
      setDisconnected(false);
      setPhase("finished");
    } catch (e) {
      // If finalize fails too (backend died with the socket), a fabricated
      // 0-score results screen would be a lie — surface the error screen.
      setError((e as Error).message);
      setDisconnected(false);
      setPhase("error");
    }
  }, []);

  /** Create a session, open the socket, begin a round. */
  const startRound = useCallback(async () => {
    if (phase !== "ready" || startingRef.current) return;
    startingRef.current = true;
    setError(null);
    setResult(null);
    setGameState(null);
    setDisconnected(false);
    gameStateRef.current = null;
    finishingRef.current = false;
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    legTrackerRef.current.reset();
    stepCounterRef.current.reset();
    try {
      const created = await createSession();
      setSession(created);
      const conn = new GameConnection(
        created.sessionId,
        (state) => {
          if (connectionRef.current !== conn) return; // stale round
          gameStateRef.current = state;
          setGameState(state);
          if (state.finished) void finishRound(created.sessionId);
        },
        // Abnormal mid-round close (WiFi blip, backend restart): never a
        // silent freeze — show the "lost the thread" notice briefly, then
        // wrap up through the normal REST finalize path (eng review T10).
        // Guards: only fires post-open (gameClient), only for the live round.
        () => {
          if (connectionRef.current !== conn || finishingRef.current) return;
          setDisconnected(true);
          disconnectTimerRef.current = setTimeout(() => {
            void finishRound(created.sessionId);
          }, DISCONNECT_NOTICE_MS);
        },
      );
      connectionRef.current = conn; // before connect: identity guard is live from the first event
      await conn.connect();
      setPhase("playing");
    } catch (e) {
      connectionRef.current = null;
      setError(`could not start the round. ${(e as Error).message ?? ""}`.trim());
      setPhase("ready");
    } finally {
      startingRef.current = false;
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
    setDisconnected(false);
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    gameStateRef.current = null;
    finishingRef.current = false;
    legTrackerRef.current.reset();
    stepCounterRef.current.reset();
    setPhase("ready");
  }, []);

  // Tear everything down on unmount.
  useEffect(() => {
    return () => {
      finishingRef.current = true; // teardown close is never "abnormal"
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sendTimerRef.current) clearInterval(sendTimerRef.current);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
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
    steps,
    handDetected,
    disconnected,
    gameState,
    session,
    result,
    error,
    webcamStatus,
    webcamError,
    // refs for the canvas renderer
    videoRef,
    landmarksRef,
    legPoseRef,
    gameStateRef,
  };
}

export type FingerSprintEngine = ReturnType<typeof useFingerSprint>;
