import { useEffect, useRef, useState } from "react";
import type { LeaderboardEntry } from "@finger-sprint/shared";
import { useFingerSprint, type FingerSprintEngine } from "./game/useFingerSprint";
import type { WebcamStatus } from "./game/useWebcam";
import { COPY } from "./copy";
import { Leaderboard } from "./components/Leaderboard";
import { WebcamThumb } from "./components/WebcamThumb";
import { GameView } from "./components/GameView";
import { Hud } from "./components/Hud";
import {
  InkButton,
  InkCheck,
  InkErrorLine,
  InkFrame,
  InkPanel,
  InkSpinner,
  InkStamp,
  TitleUnderline,
} from "./components/InkChrome";

/** Practice steps required before the sprint unlocks (calibration gate). */
export const PRACTICE_STEPS = 3;
/** Hand seen but no new steps for this long → show the coaching line. */
const COACHING_AFTER_MS = 3000;

export default function App() {
  const engine = useFingerSprint();
  const { phase } = engine;

  const [lbKey, setLbKey] = useState(0);
  const [submitted, setSubmitted] = useState<LeaderboardEntry | undefined>(undefined);

  // A new round invalidates the previous round's submission — otherwise
  // round 2's results show round 1's rank and pinned row (stale data).
  useEffect(() => {
    if (phase === "playing") setSubmitted(undefined);
  }, [phase]);

  const showThumb = phase === "ready" || phase === "playing" || phase === "finished";

  return (
    <div className="app">
      <h1 className="app__title">{COPY.title}</h1>
      <TitleUnderline />
      <p className="app__tagline">{COPY.tagline}</p>

      {phase === "idle" && <HomeScreen engine={engine} lbKey={lbKey} />}
      {phase === "loading" && <LoadingScreen webcamStatus={engine.webcamStatus} />}
      {phase === "error" && <ErrorScreen engine={engine} />}
      {phase === "ready" && <CalibrationScreen engine={engine} />}
      {phase === "playing" && <PlayScreen engine={engine} />}
      {phase === "finished" && (
        <ResultsScreen
          engine={engine}
          lbKey={lbKey}
          submitted={submitted}
          onSubmitted={(entry: LeaderboardEntry) => {
            setSubmitted(entry);
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
  const [howtoOpen, setHowtoOpen] = useState(false);
  return (
    <div className="screen screen--home">
      {/* The idle ink scene: teaches the aesthetic before play. */}
      <div className="stage">
        <GameView
          gameStateRef={engine.gameStateRef}
          legPoseRef={engine.legPoseRef}
          trackLength={1000}
          mode="idle"
        />
        <InkFrame />
      </div>

      <div className="home-strip">
        <InkPanel>
          <h2>{COPY.home.heading}</h2>
          <p className="lede">{COPY.home.lede}</p>
          <button
            className="howto-toggle"
            aria-expanded={howtoOpen}
            onClick={() => setHowtoOpen((o) => !o)}
          >
            {COPY.home.howtoToggle}
          </button>
          {howtoOpen && (
            <ol className="howto">
              {COPY.home.howto.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          )}
          <div className="start-area">
            <InkButton primary onClick={() => void engine.prepare()}>
              {COPY.home.start}
            </InkButton>
            <p className="trust-line">{COPY.home.trust}</p>
          </div>
          {/* Below 820px the play path is this card, not a broken game. */}
          <div className="mobile-card">
            <p className="lede">{COPY.home.mobileCard}</p>
          </div>
        </InkPanel>

        <Leaderboard refreshKey={lbKey} />
      </div>
    </div>
  );
}

function LoadingScreen({ webcamStatus }: { webcamStatus: WebcamStatus }) {
  const msg =
    webcamStatus === "requesting"
      ? COPY.loading.requesting
      : webcamStatus === "ready"
        ? COPY.loading.model
        : COPY.loading.ready;
  return (
    <div className="screen screen--center">
      <InkPanel center>
        <InkSpinner />
        <p>{msg}</p>
        <p className="muted">{COPY.loading.note}</p>
        <p className="trust-line">{COPY.home.trust}</p>
      </InkPanel>
    </div>
  );
}

function ErrorScreen({ engine }: { engine: FingerSprintEngine }) {
  const { webcamStatus, webcamError, error } = engine;
  const { title, body } = describeError(webcamStatus, webcamError, error);
  return (
    <div className="screen screen--center">
      <InkPanel center>
        <h2>{title}</h2>
        <p className="muted">{body}</p>
        <InkButton primary onClick={() => void engine.prepare()}>
          {COPY.errors.retry}
        </InkButton>
      </InkPanel>
    </div>
  );
}

function CalibrationScreen({ engine }: { engine: FingerSprintEngine }) {
  const { steps, handDetected } = engine;
  const coaching = useCoaching(handDetected, steps);
  const locked = steps < PRACTICE_STEPS;

  return (
    <div className="screen screen--center">
      <InkPanel center>
        <h2>{COPY.calibrate.heading}</h2>
        <p className="muted">
          {handDetected ? COPY.calibrate.handSeen : COPY.calibrate.handPrompt}
        </p>

        <div className="big-steps boil-jitter">
          <span className="big-steps__value">{steps}</span>
          <span className="label">{COPY.calibrate.stepsLabel}</span>
        </div>

        {coaching && <p className="coaching">{COPY.calibrate.coaching}</p>}

        <div className={`detect-badge${handDetected ? " is-on" : ""}`}>
          {handDetected ? COPY.calibrate.badgeOn : COPY.calibrate.badgeOff}
        </div>

        <InkButton primary onClick={() => void engine.startRound()} disabled={locked}>
          {locked ? COPY.calibrate.startLocked(PRACTICE_STEPS - steps) : COPY.calibrate.start}
        </InkButton>
      </InkPanel>
    </div>
  );
}

/**
 * Coaching state (design doc F6): the hand is tracked but steps aren't
 * incrementing for a few seconds — the player is holding a static hand and
 * doesn't know the gesture yet.
 */
function useCoaching(handDetected: boolean, steps: number): boolean {
  const [coaching, setCoaching] = useState(false);
  const lastStepsRef = useRef(steps);

  useEffect(() => {
    if (!handDetected) {
      setCoaching(false);
      return;
    }
    if (steps !== lastStepsRef.current) {
      lastStepsRef.current = steps;
      setCoaching(false);
    }
    const timer = setTimeout(() => setCoaching(true), COACHING_AFTER_MS);
    return () => clearTimeout(timer);
  }, [handDetected, steps]);

  return coaching;
}

function PlayScreen({ engine }: { engine: FingerSprintEngine }) {
  const trackLength = engine.session?.trackLength ?? 1000;
  return (
    <div className="screen screen--play">
      <div className="stage">
        <GameView
          gameStateRef={engine.gameStateRef}
          legPoseRef={engine.legPoseRef}
          trackLength={trackLength}
          mode="play"
        />
        <Hud
          state={engine.gameState}
          trackLength={trackLength}
          disconnected={engine.disconnected}
        />
        <InkFrame />
      </div>
    </div>
  );
}

function ResultsScreen({
  engine,
  lbKey,
  submitted,
  onSubmitted,
}: {
  engine: FingerSprintEngine;
  lbKey: number;
  submitted: LeaderboardEntry | undefined;
  onSubmitted: (entry: LeaderboardEntry) => void;
}) {
  const { result } = engine;
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Payoff choreography: focus arrives only after the form has faded in
  // (~650ms) — never dump the player into a text input at the emotional peak.
  // Reduced motion skips the wait along with the animation.
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const t = setTimeout(() => nameInputRef.current?.focus(), reduced ? 0 : 700);
    return () => clearTimeout(t);
  }, []);

  // Win = actually reached the finish line; otherwise the timer ran out.
  const trackLength = engine.session?.trackLength ?? Infinity;
  const reached = (result?.distance ?? 0) >= trackLength;
  const score = result?.score ?? 0;
  const shownScore = useCountUp(score);

  return (
    <div className="screen screen--results">
      <InkPanel center>
        <p className="result-outcome">
          <OutcomeGlyph win={reached} />
          <span className="hud__numeral" style={{ fontSize: 28 }}>
            {reached ? COPY.results.win : COPY.results.timeout}
          </span>
        </p>

        <div className="result-score">
          <span className="result-score__value">{shownScore.toLocaleString()}</span>
          <span className="label">{COPY.results.pointsLabel}</span>
          {/* The hanko — the score's seal. Slams once, then sits still. */}
          <InkStamp className="result-hanko" value="ran" big slamKey={result?.sessionId} />
        </div>

        <p className="muted">
          {COPY.results.stats(result?.distance ?? 0, submitted?.rank ?? result?.rank ?? "—")}
        </p>

        {!done ? (
          /* The form arrives AFTER the score has drawn itself on — the player
             is never dumped straight into a text input at the peak. */
          <form
            className="submit-form fade-in-late"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || submitting) return;
              setSubmitting(true);
              setErr(null);
              engine
                .submitName(name.trim())
                .then((entry) => {
                  onSubmitted(entry);
                  setDone(true);
                })
                .catch((e2: Error) => setErr(e2.message))
                .finally(() => setSubmitting(false));
            }}
          >
            <label className="ink-input-wrap">
              <span className="label">{COPY.results.nameLabel}</span>
              <input
                ref={nameInputRef}
                className="ink-input"
                type="text"
                placeholder={COPY.results.namePlaceholder}
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <InkButton primary type="submit" disabled={submitting || !name.trim()}>
              {submitting ? COPY.results.submitting : COPY.results.submit}
            </InkButton>
          </form>
        ) : (
          <p className="success-line">
            <InkCheck />
            {COPY.results.saved}
          </p>
        )}
        {err && <InkErrorLine>{err}</InkErrorLine>}

        <InkButton onClick={engine.playAgain}>{COPY.results.again}</InkButton>
      </InkPanel>

      <Leaderboard
        refreshKey={lbKey}
        highlightId={submitted?.id}
        pinned={submitted ? { name: submitted.name, score: submitted.score, rank: submitted.rank } : null}
      />
    </div>
  );
}

/** Win = the red flag (budgeted mark); timeout = an ink stopwatch. */
function OutcomeGlyph({ win }: { win: boolean }) {
  if (win) {
    return (
      <svg viewBox="0 0 30 30" aria-hidden>
        <path className="flag-pole" d="M8 28 L9 3" />
        <path className="flag-glyph" d="M9 4 L26 9 L9 15 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 30" aria-hidden>
      <circle className="clock-glyph" cx="15" cy="17" r="11" />
      <path className="clock-glyph" d="M15 11 L15 17 L20 20" />
      <path className="clock-glyph" d="M12 3 L18 3" />
    </svg>
  );
}

/**
 * Payoff choreography: the score writes itself on over ~600ms (respects
 * prefers-reduced-motion by jumping straight to the final value).
 */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

/* ------------------------------- helpers ------------------------------- */

function describeError(
  status: WebcamStatus,
  webcamError: string | null,
  generalError: string | null,
): { title: string; body: string } {
  switch (status) {
    case "denied":
      return COPY.errors.denied;
    case "notfound":
      return COPY.errors.notfound;
    case "busy":
      return COPY.errors.busy;
    case "unsupported":
      return COPY.errors.unsupported;
    default:
      return {
        title: COPY.errors.generic.title,
        body: generalError ?? webcamError ?? COPY.errors.generic.body,
      };
  }
}
