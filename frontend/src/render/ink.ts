/**
 * The ink kernel — everything that makes strokes look hand-drawn, shared by
 * the canvas scene renderer (renderGame.ts) and the DOM sidecar (inkSvg.ts).
 *
 * Line boil model (see DESIGN.md → Strokes & line boil):
 *
 *   nowMs ──► boilFrame(now, hz) ──► 0 | 1 | 2      (flipbook clock)
 *                                      │
 *          static geometry: 3 rough.js variants pre-rendered per frame
 *          dynamic geometry: hashJitter(vertex, frame) per vertex
 *
 * HARD RULE: nothing in this module may call Math.random() at draw time, and
 * rough.js generation never happens in the hot loop — only at cache-build time.
 */
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator";

/* ------------------------------- palettes ------------------------------ */

export interface InkPalette {
  /** Page/scene background. */
  paper: string;
  /** Primary stroke + text color (ink-100). */
  ink: string;
  /** The only allowed muted TEXT color (ink-55). */
  inkMuted: string;
  /** The single accent — four achievement marks only (see DESIGN.md). */
  signal: string;
  /** Grain tile base luminance ("dark" inverts the noise). */
  grain: "light" | "dark";
}

/** Light default: warm paper, near-black ink. */
export const PAPER_PALETTE: InkPalette = {
  paper: "#FAF7F0",
  ink: "#1a1a1a",
  inkMuted: "#595959",
  signal: "#C0392B",
  grain: "light",
};

/** prefers-color-scheme: dark — midnight ink (same red). */
export const MIDNIGHT_PALETTE: InkPalette = {
  paper: "#12100C",
  ink: "#EDE9E0",
  inkMuted: "#A09A8E",
  signal: "#C0392B",
  grain: "dark",
};

/** ink-28 / hairline tints: decorative STROKES only, never text. */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------ boil clock ----------------------------- */

export const BOIL_VARIANTS = 3;
export const BOIL_HZ_PLAY = 10;
export const BOIL_HZ_IDLE = 5;

/** Flipbook clock: which of the 3 pre-drawn variants is live right now. */
export function boilFrame(nowMs: number, hz: number): number {
  return Math.floor((nowMs / 1000) * hz) % BOIL_VARIANTS;
}

/* ------------------------------ hash jitter ---------------------------- */

/**
 * Deterministic per-vertex jitter for DYNAMIC geometry (runner limbs, flag,
 * dust) — stable within a boil frame, different across frames, and free of
 * Math.random() so replays and tests are exact.
 * Returns a value in [-1, 1].
 */
export function hashJitter(vertexIndex: number, frame: number, salt = 0): number {
  const x = Math.sin(vertexIndex * 127.1 + frame * 311.7 + salt * 74.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Polyline with hand-drawn wobble; the cheap dynamic-geometry primitive. */
export function jitterPath(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  frame: number,
  amplitude: number,
  salt = 0,
): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const jx = x + hashJitter(i, frame, salt) * amplitude;
    const jy = y + hashJitter(i + 101, frame, salt) * amplitude;
    if (i === 0) ctx.moveTo(jx, jy);
    else ctx.lineTo(jx, jy);
  });
  ctx.stroke();
}

/* --------------------------- rough.js wrappers ------------------------- */

/** rough.js option presets (DESIGN.md → Strokes & line boil). */
export const ROUGH_UI = { roughness: 1.5, bowing: 1 } as const;
export const ROUGH_LANDSCAPE = { roughness: 2.0, bowing: 1.2 } as const;

/**
 * Seeded generators, one per boil variant. Seeds are arbitrary but FIXED —
 * variant N must draw identically across sessions (cache-safe, test-safe).
 */
export const VARIANT_SEEDS = [1013, 2027, 3041] as const;

export function variantGenerator(variant: number): RoughGenerator {
  return rough.generator({
    options: { seed: VARIANT_SEEDS[variant % BOIL_VARIANTS] },
  });
}

/* ------------------------------ stamp spec ----------------------------- */

/**
 * One stamp identity, two renderers: the in-HUD combo stamp and the results
 * hanko share these numbers (eng review: stamp DRY).
 */
export const STAMP_SPEC = {
  rotationDeg: -7,
  dash: [18, 3, 26, 2, 30, 4] as const,
  strokeWidth: 3.5,
} as const;

/* ------------------------------ grain tile ----------------------------- */

/**
 * One 256px noise tile generated at boot (NOT per frame) and used as a
 * repeating CSS background above the canvas. Deterministic via hashJitter.
 */
export function makeGrainTileDataUri(palette: InkPalette, size = 256): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const dotColor = palette.grain === "light" ? "rgba(0,0,0," : "rgba(255,255,255,";
  for (let i = 0; i < 900; i++) {
    const x = ((hashJitter(i, 0, 7) + 1) / 2) * size;
    const y = ((hashJitter(i, 1, 13) + 1) / 2) * size;
    const a = 0.015 + ((hashJitter(i, 2, 29) + 1) / 2) * 0.02;
    ctx.fillStyle = `${dotColor}${a.toFixed(3)})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  return canvas.toDataURL();
}
