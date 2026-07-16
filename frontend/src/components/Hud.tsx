import { useMemo } from "react";
import type { StateMessage } from "@finger-sprint/shared";
import { COPY } from "../copy";
import { InkStamp } from "./InkChrome";

/**
 * The diegetic HUD — a DOM overlay in the ink language (DESIGN.md → Play HUD
 * slots). Score is the top-right hero (the game ranks by score); the red combo
 * stamp overlaps the score block; distance rides beneath; the pace gauge +
 * steps sit bottom-left. Numerals boil via the CSS `.boil-jitter` clock.
 *
 *   ┌───────────────────────── stage ─────────────────────────┐
 *   │ 0:42            ·· progress line ··          1,240 [×3] │
 *   │ TIME LEFT                                    SCORE      │
 *   │                                              312m/500m  │
 *   │                 (runner band — canvas)                  │
 *   │ (pace 67) 184 steps                        [your hand]  │
 *   └──────────────────────────────────────────────────────────┘
 */
export function Hud({
  state,
  trackLength,
  disconnected,
}: {
  state: StateMessage | null;
  trackLength: number;
  disconnected?: boolean;
}) {
  const timeSec = state ? Math.ceil(state.timeRemaining / 1000) : 0;
  const distance = state?.distance ?? 0;
  const score = state?.score ?? 0;
  const steps = state?.steps ?? 0;
  const speed = state?.speed ?? 0;
  const multiplier = state?.multiplier ?? 1;
  const comboActive = multiplier > 1;

  return (
    <div className="hud">
      <div className="hud__time boil-jitter">
        <span className="hud__numeral">{formatTime(timeSec)}</span>
        <span className="label">{COPY.hud.time}</span>
      </div>

      <div className="hud__score boil-jitter">
        <span className="hud__numeral">{score.toLocaleString()}</span>
        <span className="label">{COPY.hud.score}</span>
        <span className="hud__distance">
          {distance}m / {trackLength}m
        </span>
      </div>

      {comboActive && (
        <div className="hud__combo">
          <InkStamp
            value={`×${multiplier.toFixed(1)}`}
            label={COPY.hud.combo}
            slamKey={Math.floor(multiplier)}
          />
        </div>
      )}

      <div className="hud__pace boil-jitter">
        <PaceGauge speed={speed} />
        <span className="hud__steps">{COPY.hud.steps(steps)}</span>
      </div>

      {disconnected && <div className="hud__notice">{COPY.play.disconnected}</div>}

      <LiveMirror timeSec={timeSec} score={score} />
    </div>
  );
}

/**
 * Screen-reader mirror: in-stage text is decorative/visual; this is the
 * accessible HUD. The string changes ONLY on 10s time-bucket transitions —
 * interpolating the raw score would mutate the live region on every server
 * tick and make screen readers announce continuously.
 */
function LiveMirror({ timeSec, score }: { timeSec: number; score: number }) {
  const bucket = Math.ceil(timeSec / 10) * 10;
  // Capture the score as of the bucket transition; ignore ticks in between.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const announced = useMemo(() => `${bucket} seconds left, score ${score}`, [bucket]);
  return (
    <div className="visually-hidden" aria-live="polite">
      {announced}
    </div>
  );
}

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 180° ink arc; fill = clamp(speed / softMax, 0, 1). softMax starts at 60
 * units/s (tune from real play — DESIGN.md → Ink Kernel Constants).
 */
export const PACE_SOFT_MAX = 60;

export function paceFill(speed: number, softMax: number = PACE_SOFT_MAX): number {
  return Math.max(0, Math.min(1, speed / softMax));
}

function PaceGauge({ speed }: { speed: number }) {
  const fill = paceFill(speed);
  // Half-circle arc, r=50, center (62,58) in a 124x66 viewBox.
  const arcLen = Math.PI * 50;
  return (
    <svg className="hud__pace-gauge" viewBox="0 0 124 66" aria-hidden>
      <path className="gauge-track" d="M 12 58 A 50 50 0 0 1 112 58" />
      <path
        className="gauge-fill"
        d="M 12 58 A 50 50 0 0 1 112 58"
        strokeDasharray={arcLen}
        strokeDashoffset={arcLen * (1 - fill)}
      />
      <text x="62" y="46" textAnchor="middle">
        {Math.round(speed)}
      </text>
      <text className="hud__pace-label" x="62" y="62">
        {COPY.hud.pace}
      </text>
    </svg>
  );
}
