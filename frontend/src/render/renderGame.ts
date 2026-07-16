import type { StateMessage } from "@finger-sprint/shared";
import type { Landmark } from "../game/handTracker";
import type { LegPose } from "../game/fingerLegs";
import {
  BOIL_HZ_IDLE,
  BOIL_HZ_PLAY,
  BOIL_VARIANTS,
  boilFrame,
  hashJitter,
  jitterPath,
  ROUGH_LANDSCAPE,
  VARIANT_SEEDS,
  withAlpha,
  PAPER_PALETTE,
  type InkPalette,
} from "./ink";
import rough from "roughjs";

/**
 * The ink scene renderer — a moving pen drawing. Pure: paints exactly what
 * RenderInput says, retains nothing between frames.
 *
 *   ┌──────────────────────── one frame ─────────────────────┐
 *   │ paper fill                                              │
 *   │ blit far-hills tile  ─┐  pre-rendered rough.js tiles,   │
 *   │ blit near-hills tile ─┤  3 boil variants each, blitted  │
 *   │ blit ground tile     ─┘  at -(scroll % period)          │
 *   │ finish line + red flag ─┐ dynamic: hashJitter polylines │
 *   │ runner (+ghost, dust)  ─┤ (zero rough.js calls in the   │
 *   │ progress line          ─┘  hot loop)                    │
 *   └─────────────────────────────────────────────────────────┘
 *
 * The HUD is NOT here — it's a DOM overlay (Hud.tsx). See DESIGN.md.
 */

export const SCENE_W = 960;
export const SCENE_H = 540;

const RUNNER_SCREEN_X_FRAC = 0.26; // runner sits ~26% across the scene
const PX_PER_UNIT = 0.7; // world distance unit -> scene px
const GROUND_FRAC = 0.78; // ground line at 78% of scene height

/* ------------------------------ scene tiles ----------------------------- */

interface TileLayer {
  /** One canvas per boil variant, each `SCENE_W + 2 * period` scene-units wide. */
  canvases: HTMLCanvasElement[];
  /** Horizontal repeat period in scene units. */
  period: number;
  /** Scroll factor applied to distance (parallax depth). */
  parallax: number;
}

export interface SceneTiles {
  far: TileLayer;
  near: TileLayer;
  ground: TileLayer;
  /** Physical pixels per scene unit the tiles were rendered at. */
  pixelScale: number;
}

/**
 * Build the static scroll tiles — the ONLY place rough.js runs for the scene.
 * Called by GameView at mount / resize / palette change, never per frame.
 */
export function buildSceneTiles(palette: InkPalette, pixelScale: number): SceneTiles {
  const groundY = SCENE_H * GROUND_FRAC;
  return {
    far: buildHillLayer(palette, pixelScale, {
      period: 320,
      parallax: 0.12,
      baseY: groundY - 46,
      groundY,
      color: withAlpha(palette.ink, 0.28),
      width: 1.4,
      hatch: false,
    }),
    near: buildHillLayer(palette, pixelScale, {
      period: 480,
      parallax: 0.25,
      baseY: groundY - 16,
      groundY,
      color: withAlpha(palette.ink, 0.55),
      width: 1.8,
      hatch: true,
    }),
    ground: buildGroundLayer(palette, pixelScale, groundY),
    pixelScale,
  };
}

function makeTileCanvas(
  period: number,
  pixelScale: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((SCENE_W + 2 * period) * pixelScale);
  canvas.height = Math.ceil(SCENE_H * pixelScale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for scene tile");
  return [canvas, ctx];
}

function buildHillLayer(
  palette: InkPalette,
  pixelScale: number,
  cfg: {
    period: number;
    parallax: number;
    baseY: number;
    groundY: number;
    color: string;
    width: number;
    hatch: boolean;
  },
): TileLayer {
  const canvases: HTMLCanvasElement[] = [];
  for (let v = 0; v < BOIL_VARIANTS; v++) {
    const [canvas, ctx] = makeTileCanvas(cfg.period, pixelScale);
    const rc = rough.canvas(canvas);
    const tileW = SCENE_W + 2 * cfg.period;
    const humpW = cfg.period / 2; // one hump per half-period -> seamless loop
    for (let x = 0; x < tileW; x += humpW) {
      // Sample the quadratic hump into a polyline for rough's linearPath
      // (device-pixel coordinates — rough draws unscaled on this canvas).
      const pts: [number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const px = (x + t * humpW) * pixelScale;
        const py =
          ((1 - t) * (1 - t) * cfg.groundY + 2 * (1 - t) * t * cfg.baseY + t * t * cfg.groundY) *
          pixelScale;
        pts.push([px, py]);
      }
      rc.linearPath(pts, {
        ...ROUGH_LANDSCAPE,
        seed: VARIANT_SEEDS[v] + x, // vary per hump, fixed per variant
        stroke: cfg.color,
        strokeWidth: cfg.width * pixelScale,
      });
      if (cfg.hatch) {
        ctx.strokeStyle = withAlpha(palette.ink, 0.25);
        ctx.lineWidth = pixelScale;
        ctx.lineCap = "round";
        for (let hx = x + humpW * 0.3; hx < x + humpW * 0.7; hx += 16) {
          ctx.beginPath();
          ctx.moveTo((hx + hashJitter(hx | 0, v) * 2) * pixelScale, (cfg.groundY - 9) * pixelScale);
          ctx.lineTo((hx - 8) * pixelScale, (cfg.groundY + 3) * pixelScale);
          ctx.stroke();
        }
      }
    }
    canvases.push(canvas);
  }
  return { canvases, period: cfg.period, parallax: cfg.parallax };
}

function buildGroundLayer(palette: InkPalette, pixelScale: number, groundY: number): TileLayer {
  const period = 120;
  const canvases: HTMLCanvasElement[] = [];
  for (let v = 0; v < BOIL_VARIANTS; v++) {
    const [canvas, ctx] = makeTileCanvas(period, pixelScale);
    ctx.scale(pixelScale, pixelScale);
    const tileW = SCENE_W + 2 * period;
    ctx.lineCap = "round";
    // Double ground line, hand-wobbled per variant.
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2.5;
    wobbleLine(ctx, 0, tileW, groundY, v, 1.6, period / 3);
    ctx.strokeStyle = withAlpha(palette.ink, 0.4);
    ctx.lineWidth = 1;
    wobbleLine(ctx, 0, tileW, groundY + 6, v + 7, 1.2, period / 3);
    // Lane dashes (periodic with the tile).
    ctx.strokeStyle = withAlpha(palette.ink, 0.45);
    ctx.lineWidth = 2;
    const dashY = groundY + (SCENE_H - groundY) * 0.42;
    for (let x = 0; x < tileW; x += period / 2) {
      ctx.beginPath();
      ctx.moveTo(x + hashJitter(x | 0, v) * 2, dashY + hashJitter(x | 0, v, 3) * 1.5);
      ctx.lineTo(x + 26, dashY + hashJitter((x | 0) + 1, v, 3) * 1.5);
      ctx.stroke();
    }
    canvases.push(canvas);
  }
  return { canvases, period, parallax: 1 };
}

/**
 * Wobbly straight line whose jitter repeats every `stepPx` — sampled on a
 * fixed grid so the tile stays periodic.
 */
function wobbleLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  salt: number,
  amp: number,
  stepPx: number,
): void {
  ctx.beginPath();
  let i = 0;
  for (let x = x0; x <= x1; x += stepPx, i++) {
    const jy = y + hashJitter(i % 3, 0, salt) * amp; // %3 keeps it period-repeating
    if (i === 0) ctx.moveTo(x, jy);
    else ctx.lineTo(x, jy);
  }
  ctx.stroke();
}

function blitTile(
  ctx: CanvasRenderingContext2D,
  layer: TileLayer,
  variant: number,
  distance: number,
  pixelScale: number,
): void {
  const scroll = (distance * layer.parallax * PX_PER_UNIT) % layer.period;
  const tile = layer.canvases[variant];
  // Destination in scene units (ctx is scene-scaled); tile is pixelScale-sized.
  ctx.drawImage(tile, -layer.period - scroll, 0, tile.width / pixelScale, tile.height / pixelScale);
}

/* -------------------------------- render -------------------------------- */

export interface RenderInput {
  state: StateMessage | null;
  /**
   * Per-leg swing driven directly by the index + middle fingers, or null when
   * no hand is tracked (the runner then falls back to a time-based jog).
   */
  legPose: LegPose | null;
  trackLength: number;
  /** performance.now() — drives boil + idle animation. */
  nowMs: number;
  /** idle = home scene (standing runner, 5Hz boil); play = live round. */
  mode: "idle" | "play";
  palette: InkPalette;
  /** Pre-built scroll tiles (GameView owns their lifecycle); null skips layers. */
  tiles: SceneTiles | null;
  /** prefers-reduced-motion: pins the boil on variant 0. */
  reducedMotion: boolean;
}

export function renderGame(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { state, legPose, trackLength, nowMs, mode, palette, tiles, reducedMotion } = input;
  const distance = mode === "play" ? (state?.distance ?? 0) : 0;
  const speed = mode === "play" ? (state?.speed ?? 0) : 0;
  const position = state?.position ?? 0;
  const hz = mode === "idle" ? BOIL_HZ_IDLE : BOIL_HZ_PLAY;
  const frame = reducedMotion ? 0 : boilFrame(nowMs, hz);

  const groundY = SCENE_H * GROUND_FRAC;
  const runnerX = SCENE_W * RUNNER_SCREEN_X_FRAC;

  // Paper.
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  // Pre-rendered parallax layers.
  if (tiles) {
    blitTile(ctx, tiles.far, frame, distance, tiles.pixelScale);
    blitTile(ctx, tiles.near, frame, distance, tiles.pixelScale);
    blitTile(ctx, tiles.ground, frame, distance, tiles.pixelScale);
  }

  drawFinishLine(ctx, palette, frame, runnerX, groundY, distance, trackLength);
  drawRunner(ctx, palette, frame, runnerX, groundY, speed, nowMs, mode, legPose);
  if (mode === "play") drawProgressLine(ctx, palette, frame, position);
}

/* ------------------------------ finish line ----------------------------- */

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  palette: InkPalette,
  frame: number,
  runnerX: number,
  groundY: number,
  distance: number,
  trackLength: number,
): void {
  const screenX = runnerX + (trackLength - distance) * PX_PER_UNIT;
  if (screenX < -40 || screenX > SCENE_W + 60) return;

  const top = groundY - 150;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  jitterPath(ctx, [[screenX, groundY], [screenX + 2, top]], frame, 1.5, 11);

  // The red flag — one of the four budgeted marks (DESIGN.md → red budget).
  ctx.fillStyle = palette.signal;
  ctx.strokeStyle = palette.signal;
  ctx.lineWidth = 1.5;
  const j = (i: number) => hashJitter(i, frame, 17) * 1.5;
  ctx.beginPath();
  ctx.moveTo(screenX + 2 + j(0), top + j(1));
  ctx.lineTo(screenX + 54 + j(2), top + 16 + j(3));
  ctx.lineTo(screenX + 2 + j(4), top + 32 + j(5));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/* -------------------------------- runner -------------------------------- */

function drawRunner(
  ctx: CanvasRenderingContext2D,
  palette: InkPalette,
  frame: number,
  x: number,
  groundY: number,
  speed: number,
  nowMs: number,
  mode: "idle" | "play",
  legPose: LegPose | null,
): void {
  let legFront: number;
  let legBack: number;
  let bob: number;

  if (mode === "idle") {
    // Standing at the start line: relaxed stance, a slow breathing bob.
    legFront = 0.18;
    legBack = -0.12;
    bob = Math.sin(nowMs / 900) * 1.5;
  } else if (legPose) {
    legFront = legPose.index;
    legBack = legPose.middle;
    bob = Math.min(9, (Math.abs(legFront) + Math.abs(legBack)) * 4.5);
  } else {
    const stride = (nowMs / 1000) * (3 + speed * 0.03);
    legFront = Math.sin(stride);
    legBack = -legFront;
    bob = Math.abs(Math.cos(stride)) * Math.min(8, 2 + speed * 0.02);
  }
  const baseY = groundY - 44 - bob;

  // Ghost strokes: the previous boil frame still visible on the page.
  const ghostFrame = (frame + BOIL_VARIANTS - 1) % BOIL_VARIANTS;
  if (mode === "play" && speed > 5) {
    drawRunnerFigure(
      ctx,
      withAlpha(palette.ink, 0.18),
      ghostFrame,
      x - 14,
      baseY + 2,
      legFront,
      legBack,
    );
  }

  // Speed whoosh lines.
  if (mode === "play" && speed > 30) {
    ctx.strokeStyle = withAlpha(palette.ink, 0.35);
    ctx.lineWidth = 2;
    const lines = Math.min(5, Math.floor(speed / 60) + 1);
    for (let i = 0; i < lines; i++) {
      const ly = baseY - 8 + i * 12;
      const len = 24 + (speed % 50);
      jitterPath(ctx, [[x - 30 - i * 6, ly], [x - 30 - i * 6 - len, ly]], frame, 1.2, 23 + i);
    }
  }

  // Dust: little pen scribble arcs kicked up behind the feet.
  if (mode === "play" && speed > 12) {
    ctx.strokeStyle = withAlpha(palette.ink, 0.4);
    ctx.lineWidth = 1.5;
    const count = Math.min(4, Math.floor(speed / 40) + 1);
    for (let i = 0; i < count; i++) {
      const px = x - 22 - ((nowMs / 4 + i * 37) % 56);
      const py = groundY - ((nowMs / 6 + i * 23) % 18);
      ctx.beginPath();
      ctx.arc(px, py, 3 + (i % 2), 0, Math.PI * 1.6);
      ctx.stroke();
    }
  }

  drawRunnerFigure(ctx, palette.ink, frame, x, baseY, legFront, legBack);
}

/** The stick figure itself — all stroke, hand-drawn head circle. */
function drawRunnerFigure(
  ctx: CanvasRenderingContext2D,
  stroke: string,
  frame: number,
  x: number,
  baseY: number,
  legFront: number,
  legBack: number,
): void {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.strokeStyle = stroke;
  ctx.lineCap = "round";

  ctx.lineWidth = 5;
  leg(ctx, legBack, frame, 31);
  leg(ctx, legFront, frame, 37);

  ctx.lineWidth = 4;
  arm(ctx, -legBack, frame, 41);
  arm(ctx, -legFront, frame, 43);

  // Torso.
  ctx.lineWidth = 5;
  jitterPath(ctx, [[0, -28], [0, 4]], frame, 1.2, 47);

  // Head: two overlapping open arcs, like a real pen circling twice.
  ctx.lineWidth = 3.5;
  const j = (i: number) => hashJitter(i, frame, 53) * 1.2;
  ctx.beginPath();
  ctx.arc(j(0), -40 + j(1), 11, 0.1, Math.PI * 2 - 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(j(2), -40 + j(3), 11.5, Math.PI * 0.7, Math.PI * 1.9);
  ctx.stroke();

  ctx.restore();
}

function leg(ctx: CanvasRenderingContext2D, swing: number, frame: number, salt: number): void {
  const kneeX = swing * 10;
  const footX = kneeX + swing * 8;
  jitterPath(ctx, [[0, 4], [kneeX, 20], [footX, 36]], frame, 1.3, salt);
}

function arm(ctx: CanvasRenderingContext2D, swing: number, frame: number, salt: number): void {
  jitterPath(ctx, [[0, -22], [swing * 12, -8]], frame, 1.2, salt);
}

/* ----------------------------- progress line ---------------------------- */

function drawProgressLine(
  ctx: CanvasRenderingContext2D,
  palette: InkPalette,
  frame: number,
  position: number,
): void {
  const pad = 40;
  const w = SCENE_W - pad * 2;
  const y = 32;
  const p = Math.max(0, Math.min(1, position));

  ctx.lineCap = "round";
  // Track (hairline).
  ctx.strokeStyle = withAlpha(palette.ink, 0.35);
  ctx.lineWidth = 1.5;
  jitterPath(ctx, [[pad, y], [pad + w, y - 2]], frame, 1, 61);
  // Covered distance (full ink).
  if (p > 0.005) {
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 4;
    jitterPath(ctx, [[pad, y], [pad + w * p, y - 2 * p]], frame, 1, 67);
  }
  // Runner pip.
  ctx.fillStyle = palette.paper;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(pad + w * p, y - 2 * p, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Finish mark: tiny red flag at the end of the line (same budgeted concept).
  ctx.fillStyle = palette.signal;
  ctx.beginPath();
  ctx.moveTo(pad + w, y - 16);
  ctx.lineTo(pad + w + 11, y - 12);
  ctx.lineTo(pad + w, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.signal;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + w, y - 16);
  ctx.lineTo(pad + w, y - 2);
  ctx.stroke();
}

/* ------------------------------ hand overlay ---------------------------- */

/**
 * Ink hand contours for the webcam thumbnail — index + middle bold (they are
 * the legs), the rest faint. Each stroke gets a paper-colored halo underlay
 * so ink reads on live video.
 */
export function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
  palette: InkPalette = PAPER_PALETTE,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks || landmarks.length < 21) return;

  const mx = (x: number) => (1 - x) * width; // mirror to match selfie view
  const my = (y: number) => y * height;

  const LEG_BONES: [number, number][] = [
    [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12],
  ];
  const LEG_TIPS = [8, 12];
  const OTHER_BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 9], [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  const strokeBones = (bones: [number, number][], color: string, w: number) => {
    // Halo underlay first, then ink — readable over any video.
    for (const [style, lw] of [
      [withAlpha(palette.paper, 0.85), w + 2.5],
      [color, w],
    ] as const) {
      ctx.strokeStyle = style as string;
      ctx.lineWidth = lw as number;
      ctx.lineCap = "round";
      for (const [a, b] of bones) {
        ctx.beginPath();
        ctx.moveTo(mx(landmarks[a].x), my(landmarks[a].y));
        ctx.lineTo(mx(landmarks[b].x), my(landmarks[b].y));
        ctx.stroke();
      }
    }
  };

  strokeBones(OTHER_BONES, withAlpha(palette.ink, 0.35), 1.5);
  strokeBones(LEG_BONES, palette.ink, 3);

  // Fingertip dots — solid ink (red stays budgeted elsewhere).
  ctx.fillStyle = palette.ink;
  for (const i of LEG_TIPS) {
    ctx.beginPath();
    ctx.arc(mx(landmarks[i].x), my(landmarks[i].y), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
