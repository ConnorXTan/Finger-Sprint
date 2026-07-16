import { describe, expect, it } from "vitest";
import { PAPER_PALETTE } from "./ink";
import { drawHandOverlay, renderGame, SCENE_H, SCENE_W, type RenderInput } from "./renderGame";
import type { StateMessage } from "@finger-sprint/shared";
import type { Landmark } from "../game/handTracker";

/**
 * The renderer is pure — feed it a recording ctx stub and assert on the calls.
 * (Tiles are exercised in the browser; here we pass tiles: null and verify the
 * dynamic geometry + mode branching.)
 */

interface Call {
  method: string;
  args: unknown[];
}

function makeCtx() {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arc: record("arc"),
    stroke: record("stroke"),
    fill: record("fill"),
    closePath: record("closePath"),
    save: record("save"),
    restore: record("restore"),
    translate: record("translate"),
    drawImage: record("drawImage"),
    setTransform: record("setTransform"),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const state: StateMessage = {
  type: "state",
  position: 0.4,
  speed: 40,
  distance: 400,
  steps: 120,
  score: 900,
  multiplier: 2,
  timeRemaining: 30_000,
  finished: false,
};

function input(overrides: Partial<RenderInput>): RenderInput {
  return {
    state,
    legPose: null,
    trackLength: 1000,
    nowMs: 1234,
    mode: "play",
    palette: PAPER_PALETTE,
    tiles: null,
    reducedMotion: false,
    ...overrides,
  };
}

describe("renderGame", () => {
  it("fills the whole scene with paper first", () => {
    const { ctx, calls } = makeCtx();
    renderGame(ctx, input({}));
    const first = calls.find((c) => c.method === "fillRect");
    expect(first?.args).toEqual([0, 0, SCENE_W, SCENE_H]);
  });

  it("draws the progress line in play mode but not in idle mode", () => {
    const play = makeCtx();
    renderGame(play.ctx, input({ mode: "play" }));
    const idle = makeCtx();
    renderGame(idle.ctx, input({ mode: "idle" }));
    // The progress pip is the only full-circle arc (0..2π) at the top band.
    const fullArcs = (calls: Call[]) =>
      calls.filter((c) => c.method === "arc" && c.args[4] === Math.PI * 2 && (c.args[1] as number) < 60);
    expect(fullArcs(play.calls).length).toBeGreaterThan(0);
    expect(fullArcs(idle.calls).length).toBe(0);
  });

  it("idle mode ignores state distance (runner stands at the start line)", () => {
    const a = makeCtx();
    renderGame(a.ctx, input({ mode: "idle", state: null }));
    const b = makeCtx();
    renderGame(b.ctx, input({ mode: "idle" })); // state present but idle
    // Same finish-line geometry either way: idle pins distance to 0.
    const firstMove = (calls: Call[]) => calls.find((c) => c.method === "moveTo")?.args;
    expect(firstMove(a.calls)).toEqual(firstMove(b.calls));
  });

  it("handles state: null with a zeroed scene (no crash, paper + runner drawn)", () => {
    const { ctx, calls } = makeCtx();
    renderGame(ctx, input({ state: null }));
    expect(calls.some((c) => c.method === "fillRect")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("reducedMotion pins the boil: identical strokes across nearby timestamps", () => {
    // 1234ms and 1334ms are different boil frames at 10Hz. Pin the leg pose so
    // the runner's own animation is time-independent — any remaining
    // difference would be boil jitter, which reducedMotion must freeze.
    const legPose = { index: 0.4, middle: -0.3, indexReach: 0, middleReach: 0 };
    const a = makeCtx();
    renderGame(a.ctx, input({ reducedMotion: true, nowMs: 1234, legPose, state: { ...state, speed: 0 } }));
    const b = makeCtx();
    renderGame(b.ctx, input({ reducedMotion: true, nowMs: 1334, legPose, state: { ...state, speed: 0 } }));
    const lines = (calls: Call[]) =>
      JSON.stringify(calls.filter((c) => c.method === "lineTo" || c.method === "moveTo"));
    expect(lines(a.calls)).toBe(lines(b.calls));

    // Sanity: WITHOUT the pin, those timestamps land on different boil frames.
    const c = makeCtx();
    renderGame(c.ctx, input({ reducedMotion: false, nowMs: 1234, legPose, state: { ...state, speed: 0 } }));
    const d = makeCtx();
    renderGame(d.ctx, input({ reducedMotion: false, nowMs: 1334, legPose, state: { ...state, speed: 0 } }));
    expect(lines(c.calls)).not.toBe(lines(d.calls));
  });

  it("blits all three tile layers with parallax scroll offsets", () => {
    const layer = (period: number, parallax: number) => ({
      canvases: [
        { width: 1600, height: 540 },
        { width: 1600, height: 540 },
        { width: 1600, height: 540 },
      ] as unknown as HTMLCanvasElement[],
      period,
      parallax,
    });
    const tiles = { far: layer(320, 0.12), near: layer(480, 0.25), ground: layer(120, 1), pixelScale: 1 };
    const { ctx, calls } = makeCtx();
    renderGame(ctx, input({ tiles, state: { ...state, distance: 100 }, reducedMotion: true }));
    const blits = calls.filter((c) => c.method === "drawImage");
    expect(blits).toHaveLength(3);
    // ground: scroll = (100 * 1 * 0.7) % 120 = 70 -> x = -120 - 70
    expect(blits[2].args[1]).toBeCloseTo(-190);
  });

  it("skips the finish line when it is far off screen", () => {
    const { ctx, calls } = makeCtx();
    renderGame(ctx, input({ state: { ...state, distance: 0 }, trackLength: 100_000 }));
    // No red strokes at all: flag not drawn, and (multiplier lives in the DOM
    // HUD now) nothing else in the scene is red except the progress finish
    // mark, which sits at the line's end regardless — so check fill calls
    // against the signal color count when the flag IS visible.
    const visible = makeCtx();
    renderGame(visible.ctx, input({ state: { ...state, distance: 900 }, trackLength: 1000 }));
    const closedPaths = (cs: Call[]) => cs.filter((c) => c.method === "closePath").length;
    expect(closedPaths(visible.calls)).toBeGreaterThan(closedPaths(calls));
  });
});

describe("drawHandOverlay", () => {
  const lm = (n: number): Landmark[] =>
    Array.from({ length: n }, (_, i) => ({ x: i / 21, y: 0.5, z: 0 }));

  it("clears and bails on null or short landmark arrays (guard both paths)", () => {
    const { ctx, calls } = makeCtx();
    drawHandOverlay(ctx, 220, 165, null);
    drawHandOverlay(ctx, 220, 165, lm(20));
    expect(calls.filter((c) => c.method === "clearRect")).toHaveLength(2);
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });

  it("draws mirrored bones and two fingertip dots for a full hand", () => {
    const { ctx, calls } = makeCtx();
    drawHandOverlay(ctx, 220, 165, lm(21));
    expect(calls.filter((c) => c.method === "stroke").length).toBeGreaterThan(0);
    // index + middle tips, each a fill()ed dot
    expect(calls.filter((c) => c.method === "fill").length).toBe(2);
    // mirror: landmark x=0 must land at canvas x=width
    const xs = calls.filter((c) => c.method === "moveTo").map((c) => c.args[0] as number);
    expect(Math.max(...xs)).toBeLessThanOrEqual(220);
  });
});
