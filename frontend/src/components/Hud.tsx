import type { StateMessage } from "@finger-sprint/shared";

/** Overlay HUD: timer, score, distance, and the flat step count. */
export function Hud({
  state,
  steps,
  trackLength,
}: {
  state: StateMessage | null;
  /** Local (client-side) step count — shown until the server state arrives. */
  steps: number;
  trackLength: number;
}) {
  const timeSec = state ? Math.ceil(state.timeRemaining / 1000) : 0;
  const distance = state?.distance ?? 0;
  const score = state?.score ?? 0;
  const multiplier = state?.multiplier ?? 1;
  const comboActive = multiplier > 1;
  // The server's accepted step count is authoritative during a round.
  const shownSteps = state?.steps ?? steps;

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
        <Stat label="Steps" value={`${shownSteps}`} />
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
