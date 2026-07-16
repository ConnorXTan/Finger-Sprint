/**
 * DOM sidecar of the ink kernel: static rough.js SVG path data for React
 * components (panel/button borders, the spinner arc, stamp geometry).
 *
 * Everything here is generated ONCE at module load from the fixed variant
 * seeds — the DOM does not boil (DESIGN.md), with the single exception of the
 * loading spinner, whose 3 pre-generated frames are cycled by pure CSS.
 */
import type { Options } from "roughjs/bin/core";
import { BOIL_VARIANTS, ROUGH_UI, variantGenerator } from "./ink";

/** Flatten a rough.js drawable into SVG path `d` strings. */
function toPathDs(
  make: (g: ReturnType<typeof variantGenerator>) => ReturnType<ReturnType<typeof variantGenerator>["rectangle"]>,
  variant: number,
): string[] {
  const g = variantGenerator(variant);
  const drawable = make(g);
  return g.toPaths(drawable).map((p) => p.d);
}

export interface InkBorder {
  /** SVG viewBox the paths were drawn in (stretch with preserveAspectRatio="none"). */
  viewBox: string;
  /** Primary stroke paths. */
  paths: string[];
  /** Heavier variant for hover states. */
  boldPaths: string[];
}

/**
 * Sketchy rectangle border in a fixed viewBox, stretched by CSS to fit any
 * panel — one generation, every size (the wireframe proved the stretch reads
 * fine). Inset keeps stroke wobble inside the box.
 */
function makeBorder(w: number, h: number, options: Options): InkBorder {
  const inset = 4;
  const rect = (g: ReturnType<typeof variantGenerator>) =>
    g.rectangle(inset, inset, w - inset * 2, h - inset * 2, options);
  return {
    viewBox: `0 0 ${w} ${h}`,
    paths: toPathDs(rect, 0),
    boldPaths: toPathDs(rect, 1),
  };
}

/** Panels (hero, results, leaderboard, error). Wide-ish aspect. */
export const PANEL_BORDER: InkBorder = makeBorder(400, 240, { ...ROUGH_UI });

/** Buttons — rounded feel via low-fidelity rough rectangle + CSS radius. */
export const BUTTON_BORDER: InkBorder = makeBorder(220, 56, { ...ROUGH_UI, roughness: 1.2 });

/** The webcam thumb frame. */
export const THUMB_BORDER: InkBorder = makeBorder(220, 165, { ...ROUGH_UI, roughness: 1.3 });

/**
 * Spinner: 3 boiled arc variants (one per boil frame), cycled by a CSS
 * steps() animation. Under prefers-reduced-motion the CSS shows frame 0 only
 * and the ellipsis dots pulse opacity instead (never a frozen full spinner).
 */
export const SPINNER_FRAMES: string[][] = Array.from({ length: BOIL_VARIANTS }, (_, v) => {
  const g = variantGenerator(v);
  // 270° open arc, drawn as a rough arc in a 48px box.
  const drawable = g.arc(24, 24, 40, 40, -Math.PI / 2, Math.PI, false, {
    ...ROUGH_UI,
    roughness: 1.2,
  });
  return g.toPaths(drawable).map((p) => p.d);
});

export const SPINNER_VIEWBOX = "0 0 48 48";

/** Hand-drawn check glyph (success confirmations). */
export const CHECK_PATHS: string[] = toPathDs(
  (g) => g.linearPath([[6, 16], [13, 24], [28, 6]], { ...ROUGH_UI, roughness: 1.2 }),
  0,
);
export const CHECK_VIEWBOX = "0 0 34 30";

/**
 * Scratchy error strike-underline (Premise 2: single strike + asterisk — the
 * double underline is reserved for the title).
 */
export const STRIKE_PATHS: string[] = toPathDs(
  (g) => g.line(2, 5, 118, 3, { ...ROUGH_UI, roughness: 2.2 }),
  0,
);
export const STRIKE_VIEWBOX = "0 0 120 8";

/** The title's signature double underline. */
export const TITLE_UNDERLINE_PATHS: string[] = [
  ...toPathDs((g) => g.line(2, 4, 336, 2, { ...ROUGH_UI, roughness: 1.6 }), 0),
  ...toPathDs((g) => g.line(6, 8, 330, 7, { ...ROUGH_UI, roughness: 2.4 }), 1),
];
export const TITLE_UNDERLINE_VIEWBOX = "0 0 340 12";
