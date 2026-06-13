import type { StateMessage } from "@finger-sprint/shared";
import type { Landmark } from "../game/movementIntensity";

/**
 * Pure canvas drawing. Given the latest authoritative state, paint one frame:
 * sky, parallax hills, a scrolling ground, the finish line, and an animated
 * runner whose stride speed follows the server's `speed`.
 *
 * The renderer reads `distance`/`position`/`speed` straight from the server and
 * never derives gameplay values itself — it only visualizes them.
 */

export interface RenderInput {
  state: StateMessage | null;
  /** Local smoothed intensity (for the little effort gauge / dust intensity). */
  intensity: number;
  trackLength: number;
  /** performance.now() — drives idle animation independent of game speed. */
  nowMs: number;
}

const RUNNER_SCREEN_X_FRAC = 0.26; // runner sits ~26% across the canvas
const PX_PER_UNIT = 0.7; // world distance unit -> screen px (for the finish line)
const GROUND_FRAC = 0.78; // ground line at 78% of canvas height

export function renderGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: RenderInput,
): void {
  const { state, intensity, trackLength, nowMs } = input;
  const distance = state?.distance ?? 0;
  const speed = state?.speed ?? 0;
  const position = state?.position ?? 0;

  const groundY = height * GROUND_FRAC;
  const runnerX = width * RUNNER_SCREEN_X_FRAC;

  drawSky(ctx, width, height);
  drawHills(ctx, width, groundY, distance);
  drawGround(ctx, width, height, groundY, distance);
  drawFinishLine(ctx, runnerX, groundY, distance, trackLength);
  drawRunner(ctx, runnerX, groundY, speed, intensity, nowMs);
  drawProgressBar(ctx, width, position);
}

/* ------------------------------- scene --------------------------------- */

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#1b2a4a");
  sky.addColorStop(0.55, "#33508a");
  sky.addColorStop(1, "#8aa0c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
}

function drawHills(ctx: CanvasRenderingContext2D, w: number, groundY: number, distance: number): void {
  // Two parallax layers, scrolling slower than the ground for depth.
  drawHillLayer(ctx, w, groundY, distance * 0.12, 220, "#2c3f63", groundY - 40);
  drawHillLayer(ctx, w, groundY, distance * 0.25, 150, "#35517f", groundY - 10);
}

function drawHillLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  groundY: number,
  scroll: number,
  spacing: number,
  color: string,
  baseY: number,
): void {
  ctx.fillStyle = color;
  const offset = -(scroll % spacing);
  for (let x = offset - spacing; x < w + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.quadraticCurveTo(x + spacing / 2, baseY, x + spacing, groundY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  groundY: number,
  distance: number,
): void {
  ctx.fillStyle = "#243018";
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = "#2f4020";
  ctx.fillRect(0, groundY, w, 6);

  // Scrolling lane dashes to convey motion.
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  const spacing = 60;
  const dashW = 28;
  const y = groundY + (h - groundY) * 0.45;
  const offset = -((distance * PX_PER_UNIT) % spacing);
  for (let x = offset - spacing; x < w + spacing; x += spacing) {
    ctx.fillRect(x, y, dashW, 5);
  }
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  runnerX: number,
  groundY: number,
  distance: number,
  trackLength: number,
): void {
  // World x of the finish converted to screen x relative to the runner.
  const screenX = runnerX + (trackLength - distance) * PX_PER_UNIT;
  if (screenX < -40 || screenX > 4000) return;

  const top = groundY - 150;
  // Pole
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(screenX, top, 6, groundY - top);
  // Checkered flag
  const rows = 4;
  const cols = 4;
  const fw = 56;
  const fh = 40;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#111" : "#fafafa";
      ctx.fillRect(screenX + 6 + c * (fw / cols), top + r * (fh / rows), fw / cols, fh / rows);
    }
  }
}

/* ------------------------------- runner -------------------------------- */

function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  speed: number,
  intensity: number,
  nowMs: number,
): void {
  // Stride frequency grows with speed; there's always a gentle idle bob.
  const stride = (nowMs / 1000) * (3 + speed * 0.03);
  const swing = Math.sin(stride);
  const bob = Math.abs(Math.cos(stride)) * Math.min(8, 2 + speed * 0.02);
  const baseY = groundY - 44 - bob;

  // Speed "whoosh" lines behind the runner.
  if (speed > 30) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    const lines = Math.min(6, Math.floor(speed / 60) + 1);
    for (let i = 0; i < lines; i++) {
      const ly = baseY - 10 + i * 12;
      const len = 24 + (speed % 60);
      ctx.beginPath();
      ctx.moveTo(x - 28 - i * 6, ly);
      ctx.lineTo(x - 28 - i * 6 - len, ly);
      ctx.stroke();
    }
  }

  // Kicked-up dust, scaled by current effort.
  const dustCount = Math.min(10, Math.floor(intensity / 8));
  ctx.fillStyle = "rgba(220,210,180,0.5)";
  for (let i = 0; i < dustCount; i++) {
    const px = x - 20 - ((nowMs / 4 + i * 37) % 60);
    const py = groundY - ((nowMs / 6 + i * 23) % 22);
    ctx.beginPath();
    ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, baseY);

  // Back leg + front leg (swing in opposition).
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  leg(ctx, swing);
  leg(ctx, -swing);

  // Arms
  ctx.lineWidth = 5;
  arm(ctx, -swing);
  arm(ctx, swing);

  // Body
  ctx.fillStyle = "#ff5a5f";
  roundedRect(ctx, -12, -30, 24, 34, 9);
  ctx.fill();

  // Head
  ctx.fillStyle = "#ffd8a8";
  ctx.beginPath();
  ctx.arc(0, -40, 11, 0, Math.PI * 2);
  ctx.fill();

  // Headband (a little flair)
  ctx.fillStyle = "#ffd43b";
  ctx.fillRect(-11, -46, 22, 4);

  ctx.restore();
}

function leg(ctx: CanvasRenderingContext2D, swing: number): void {
  const hipX = 0;
  const hipY = 4;
  const kneeX = hipX + swing * 10;
  const kneeY = hipY + 16;
  const footX = kneeX + swing * 8;
  const footY = kneeY + 16;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
}

function arm(ctx: CanvasRenderingContext2D, swing: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(swing * 12, -8);
  ctx.stroke();
}

/* ------------------------------ progress ------------------------------- */

function drawProgressBar(ctx: CanvasRenderingContext2D, w: number, position: number): void {
  const pad = 24;
  const barW = w - pad * 2;
  const barH = 8;
  const y = 18;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundedRect(ctx, pad, y, barW, barH, 4);
  ctx.fill();
  ctx.fillStyle = "#ffd43b";
  roundedRect(ctx, pad, y, Math.max(barH, barW * position), barH, 4);
  ctx.fill();

  // Runner pip + finish flag glyph.
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(pad + barW * position, y + barH / 2, 7, 0, Math.PI * 2);
  ctx.fill();
}

/* ------------------------------- helpers ------------------------------- */

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw hand landmarks onto a (usually small) overlay canvas — the webcam
 * thumbnail. Mirrored to match the selfie-view video.
 */
export function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: Landmark[] | null,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks || landmarks.length < 21) return;

  const mx = (x: number) => (1 - x) * width; // mirror horizontally
  const my = (y: number) => y * height;

  // Bones connecting the standard MediaPipe hand skeleton.
  const BONES: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  ctx.strokeStyle = "rgba(120,220,255,0.9)";
  ctx.lineWidth = 2;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(mx(landmarks[a].x), my(landmarks[a].y));
    ctx.lineTo(mx(landmarks[b].x), my(landmarks[b].y));
    ctx.stroke();
  }

  ctx.fillStyle = "#ffd43b";
  for (const lm of landmarks) {
    ctx.beginPath();
    ctx.arc(mx(lm.x), my(lm.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
