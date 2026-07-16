import type { CSSProperties, ReactNode } from "react";
import { STAMP_SPEC } from "../render/ink";
import {
  BUTTON_BORDER,
  CHECK_PATHS,
  CHECK_VIEWBOX,
  PANEL_BORDER,
  SPINNER_FRAMES,
  SPINNER_VIEWBOX,
  STRIKE_PATHS,
  STRIKE_VIEWBOX,
  TITLE_UNDERLINE_PATHS,
  TITLE_UNDERLINE_VIEWBOX,
  type InkBorder,
} from "../render/inkSvg";

/**
 * DOM chrome drawn in the ink language. Borders are rough.js paths generated
 * once at module load (inkSvg.ts) and stretched — the DOM does not boil; the
 * only exception is the spinner, cycled by pure CSS.
 */

/** Standalone sketch frame — used by the stage around the game canvas. */
export function InkFrame({ className }: { className?: string }) {
  return <BorderSvg border={PANEL_BORDER} className={className} />;
}

export function BorderSvg({ border, className }: { border: InkBorder; className?: string }) {
  return (
    <svg
      className={`ink-border ${className ?? ""}`}
      viewBox={border.viewBox}
      preserveAspectRatio="none"
      aria-hidden
    >
      {border.paths.map((d, i) => (
        <path key={`n${i}`} className="ink-border__stroke" d={d} />
      ))}
      {border.boldPaths.map((d, i) => (
        <path key={`b${i}`} className="ink-border__stroke ink-border__stroke--bold" d={d} />
      ))}
    </svg>
  );
}

/** A sketch-bordered panel. */
export function InkPanel({
  children,
  className,
  center,
}: {
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <div className={`ink-panel${center ? " ink-panel--center" : ""} ${className ?? ""}`}>
      <BorderSvg border={PANEL_BORDER} />
      <div className="ink-panel__body">{children}</div>
    </div>
  );
}

/** A sketch-bordered button. Hover thickens the stroke (bold border variant). */
export function InkButton({
  children,
  onClick,
  type = "button",
  disabled,
  primary,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`ink-btn${primary ? " ink-btn--primary" : ""} ${className ?? ""}`}
      onClick={onClick}
      type={type}
      disabled={disabled}
    >
      <BorderSvg border={BUTTON_BORDER} />
      <span className="ink-btn__label">{children}</span>
    </button>
  );
}

/**
 * Loading spinner: 3 boiled arc frames cycled by CSS steps(). Under
 * prefers-reduced-motion the CSS pins frame 0 and pulses the dots' opacity
 * instead (a frozen spinner reads as a hang — DESIGN.md).
 */
export function InkSpinner() {
  return (
    <span className="ink-spinner" role="status" aria-label="loading">
      {SPINNER_FRAMES.map((paths, v) => (
        <svg key={v} className={`ink-spinner__frame ink-spinner__frame--${v}`} viewBox={SPINNER_VIEWBOX} aria-hidden>
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      ))}
      <span className="ink-spinner__dots" aria-hidden>
        <i>.</i>
        <i>.</i>
        <i>.</i>
      </span>
    </span>
  );
}

/**
 * The red stamp — one identity (STAMP_SPEC) for the combo stamp and the
 * results hanko. `slamKey` retriggers the two-frame slam animation.
 */
export function InkStamp({
  value,
  label,
  slamKey,
  big,
  className,
}: {
  value: string;
  label?: string;
  slamKey?: string | number;
  big?: boolean;
  className?: string;
}) {
  return (
    <span
      key={slamKey}
      className={`ink-stamp${big ? " ink-stamp--big" : ""} ${className ?? ""}`}
      style={{ "--stamp-rot": `${STAMP_SPEC.rotationDeg}deg` } as CSSProperties}
    >
      <svg viewBox="0 0 92 60" aria-hidden>
        <rect
          x="3"
          y="3"
          width="86"
          height="54"
          fill="none"
          strokeWidth={STAMP_SPEC.strokeWidth}
          strokeDasharray={STAMP_SPEC.dash.join(" ")}
        />
      </svg>
      <span className="ink-stamp__value">{value}</span>
      {label && <span className="ink-stamp__label">{label}</span>}
    </span>
  );
}

/** Hand-drawn check for success confirmations. */
export function InkCheck() {
  return (
    <svg className="ink-check" viewBox={CHECK_VIEWBOX} aria-hidden>
      {CHECK_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/**
 * Error line: drawn asterisk + scratchy single strike-underline (the double
 * underline is the title's — one motif, one meaning).
 */
export function InkErrorLine({ children }: { children: ReactNode }) {
  return (
    <span className="ink-error" role="alert">
      <span className="ink-error__mark" aria-hidden>
        *
      </span>
      <span className="ink-error__text">
        {children}
        <svg className="ink-error__strike" viewBox={STRIKE_VIEWBOX} preserveAspectRatio="none" aria-hidden>
          {STRIKE_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </span>
    </span>
  );
}

/** The title's signature double underline. */
export function TitleUnderline() {
  return (
    <svg className="title-underline" viewBox={TITLE_UNDERLINE_VIEWBOX} preserveAspectRatio="none" aria-hidden>
      {TITLE_UNDERLINE_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
