import type { StateMessage } from "@finger-sprint/shared";

/** Overlay HUD: timer, distance, speed, score, and the live effort gauge. */
export function Hud({
  state,
  intensity,
  trackLength,
}: {
  state: StateMessage | null;
  intensity: number;
  trackLength: number;
}) {
  const timeSec = state ? Math.ceil(state.timeRemaining / 1000) : 0;
  const distance = state?.distance ?? 0;
  const speed = state?.speed ?? 0;
  const score = state?.score ?? 0;
  const multiplier = state?.multiplier ?? 1;
  const comboActive = multiplier > 1;
  // Effort gauge maxes out around the server's intensity clamp (120).
  const effort = Math.max(0, Math.min(1, intensity / 120));

  return (
    <div className="hud">
      <div className="hud__top">
        <Stat label="Time" value={`${timeSec}s`} big accent={timeSec <= 5} />
        {comboActive && (
          <div className="combo" key={Math.floor(multiplier)}>
            <span className="combo__x">×{multiplier.toFixed(1)}</span>
            <span className="combo__label">combo</span>
          </div>
        )}
        <Stat label="Score" value={score.toLocaleString()} big />
      </div>

      <div className="hud__row">
        <Stat label="Distance" value={`${distance} / ${trackLength}`} />
        <Stat label="Speed" value={`${speed}`} />
      </div>

      <div className="hud__effort">
        <span className="hud__effort-label">Finger speed</span>
        <div className="hud__effort-track">
          <div className="hud__effort-fill" style={{ width: `${effort * 100}%` }} />
        </div>
        <span className="hud__effort-value">{Math.round(intensity)}</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  big,
  accent,
}: {
  label: string;
  value: string;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`stat${big ? " stat--big" : ""}${accent ? " stat--accent" : ""}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}
