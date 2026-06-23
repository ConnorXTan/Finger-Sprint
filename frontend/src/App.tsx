import { useState } from "react";
import type { LeaderboardEntry } from "@finger-sprint/shared";
import { useFingerSprint, type FingerSprintEngine } from "./game/useFingerSprint";
import type { WebcamStatus } from "./game/useWebcam";
import { Leaderboard } from "./components/Leaderboard";
import { WebcamThumb } from "./components/WebcamThumb";
import { GameView } from "./components/GameView";
import { Hud } from "./components/Hud";

export default function App() {
  const engine = useFingerSprint();
  const { phase } = engine;

  // Bump to force the leaderboard to reload after a submission.
  const [lbKey, setLbKey] = useState(0);
  const [submittedId, setSubmittedId] = useState<number | undefined>(undefined);

  const showThumb = phase === "ready" || phase === "playing" || phase === "finished";

  return (
    <div className="app">
      <h1 className="app__title">
        Finger&nbsp;Sprint <span className="app__title-emoji">🏃✋</span>
      </h1>

      {phase === "idle" && <HomeScreen engine={engine} lbKey={lbKey} />}
      {phase === "loading" && <LoadingScreen webcamStatus={engine.webcamStatus} />}
      {phase === "error" && <ErrorScreen engine={engine} />}
      {phase === "ready" && <CalibrationScreen engine={engine} />}
      {phase === "playing" && <PlayScreen engine={engine} />}
      {phase === "finished" && (
        <ResultsScreen
          engine={engine}
          lbKey={lbKey}
          submittedId={submittedId}
          onSubmitted={(entry: LeaderboardEntry) => {
            setSubmittedId(entry.id);
            setLbKey((k) => k + 1);
          }}
        />
      )}

      {/* The webcam <video> stays mounted for the whole app lifetime so the
          ref is valid the moment we attach the stream during `prepare()`. We
          only hide it visually (opacity, not display:none — Safari won't play a
          display:none video) until it's relevant. */}
      <div className={`thumb-dock${showThumb ? "" : " is-hidden"}`}>
        <WebcamThumb videoRef={engine.videoRef} landmarksRef={engine.landmarksRef} />
      </div>
    </div>
  );
}

/* ------------------------------- screens ------------------------------- */

function HomeScreen({ engine, lbKey }: { engine: FingerSprintEngine; lbKey: number }) {
  return (
    <div className="screen screen--home">
      <div className="panel panel--hero">
        <p className="lede">
          "Walk" your index and middle fingers in front of the webcam — like two
          little legs. Each step drives your runner; the faster you step, the
          faster you sprint. Cover the most distance before the timer runs out!
        </p>
        <ol className="howto">
          <li>Allow camera access (video never leaves your device).</li>
          <li>Hold one hand up so the skeleton appears.</li>
          <li>Walk your index + middle fingers — alternate them like legs. 🚶💨</li>
        </ol>
        <button className="btn btn--primary btn--lg" onClick={() => void engine.prepare()}>
          Start
        </button>
      </div>
      <Leaderboard refreshKey={lbKey} />
    </div>
  );
}

function LoadingScreen({ webcamStatus }: { webcamStatus: WebcamStatus }) {
  const msg =
    webcamStatus === "requesting"
      ? "Requesting camera access…"
      : webcamStatus === "ready"
        ? "Loading the hand-tracking model…"
        : "Getting things ready…";
  return (
    <div className="screen screen--center">
      <div className="panel">
        <div className="spinner" aria-hidden />
        <p className="loading-msg">{msg}</p>
        <p className="muted">First load downloads the model (~a few MB).</p>
      </div>
    </div>
  );
}

function ErrorScreen({ engine }: { engine: FingerSprintEngine }) {
  const { webcamStatus, webcamError, error } = engine;
  const { title, body } = describeError(webcamStatus, webcamError, error);
  return (
    <div className="screen screen--center">
      <div className="panel">
        <h2 className="error-title">{title}</h2>
        <p className="muted">{body}</p>
        <button className="btn btn--primary" onClick={() => void engine.prepare()}>
          Try again
        </button>
      </div>
    </div>
  );
}

function CalibrationScreen({ engine }: { engine: FingerSprintEngine }) {
  const { stepsPerMinute, steps, handDetected } = engine;
  return (
    <div className="screen screen--center">
      <div className="panel panel--calibrate">
        <h2>Calibration</h2>
        <p className="muted">
          {handDetected
            ? "Hand detected! Walk your index + middle fingers — each step counts."
            : "Hold your hand up to the camera so the skeleton appears."}
        </p>

        <div className={`big-intensity${handDetected ? " is-live" : ""}`}>
          <span className="big-intensity__value">{stepsPerMinute}</span>
          <span className="big-intensity__label">steps / min</span>
        </div>

        <div className={`detect-badge${handDetected ? " is-on" : ""}`}>
          {handDetected ? `✋ tracking · ${steps} steps` : "no hand"}
        </div>

        <button
          className="btn btn--primary btn--lg"
          onClick={() => void engine.startRound()}
          disabled={!handDetected}
        >
          {handDetected ? "Start sprint!" : "Show your hand to start"}
        </button>
      </div>
    </div>
  );
}

function PlayScreen({ engine }: { engine: FingerSprintEngine }) {
  const trackLength = engine.session?.trackLength ?? 1000;
  return (
    <div className="screen screen--play">
      <div className="stage">
        <GameView
          gameStateRef={engine.gameStateRef}
          intensityRef={engine.intensityRef}
          legPoseRef={engine.legPoseRef}
          trackLength={trackLength}
        />
        <Hud
          state={engine.gameState}
          intensity={engine.intensity}
          steps={engine.steps}
          stepsPerMinute={engine.stepsPerMinute}
          trackLength={trackLength}
        />
      </div>
    </div>
  );
}

function ResultsScreen({
  engine,
  lbKey,
  submittedId,
  onSubmitted,
}: {
  engine: FingerSprintEngine;
  lbKey: number;
  submittedId: number | undefined;
  onSubmitted: (entry: LeaderboardEntry) => void;
}) {
  const { result } = engine;
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Win = actually reached the finish line; otherwise the timer ran out.
  const trackLength = engine.session?.trackLength ?? Infinity;
  const reached = (result?.distance ?? 0) >= trackLength;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const entry = await engine.submitName(name.trim());
      onSubmitted(entry);
      setDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen screen--results">
      <div className="panel panel--results">
        <h2>{reached ? "Finished! 🎉" : "Time’s up! ⏱️"}</h2>
        <div className="result-score">
          <span className="result-score__value">{(result?.score ?? 0).toLocaleString()}</span>
          <span className="result-score__label">points</span>
        </div>
        <p className="muted">
          Distance {result?.distance ?? 0} · provisional rank #{result?.rank ?? "—"}
        </p>

        {!done ? (
          <form className="submit-form" onSubmit={handleSubmit}>
            <input
              className="input"
              type="text"
              placeholder="Your name"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button className="btn btn--primary" type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Saving…" : "Submit score"}
            </button>
          </form>
        ) : (
          <p className="success">Saved! You’re on the board. 🏆</p>
        )}
        {err && <p className="error">{err}</p>}

        <button className="btn btn--ghost" onClick={engine.playAgain}>
          Play again
        </button>
      </div>

      <Leaderboard refreshKey={lbKey} highlightId={submittedId} />
    </div>
  );
}

/* ------------------------------- helpers ------------------------------- */

function describeError(
  status: WebcamStatus,
  webcamError: string | null,
  generalError: string | null,
): { title: string; body: string } {
  switch (status) {
    case "denied":
      return {
        title: "Camera permission denied",
        body: "Finger Sprint needs your webcam to track hand movement. Enable camera access for this site in your browser settings, then try again.",
      };
    case "notfound":
      return {
        title: "No camera found",
        body: "We couldn’t find a webcam. Plug one in (or enable it) and try again.",
      };
    case "unsupported":
      return {
        title: "Webcam not supported",
        body: "This browser doesn’t support getUserMedia. Try a recent Chrome, Edge, or Firefox over https/localhost.",
      };
    default:
      return {
        title: "Something went wrong",
        body: generalError ?? webcamError ?? "An unexpected error occurred. Please try again.",
      };
  }
}
