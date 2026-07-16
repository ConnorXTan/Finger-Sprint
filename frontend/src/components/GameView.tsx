import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { StateMessage } from "@finger-sprint/shared";
import type { LegPose } from "../game/fingerLegs";
import {
  buildSceneTiles,
  renderGame,
  SCENE_H,
  SCENE_W,
  type SceneTiles,
} from "../render/renderGame";
import { BOIL_HZ_IDLE, boilFrame, MIDNIGHT_PALETTE, PAPER_PALETTE } from "../render/ink";

/**
 * The ink scene canvas. Owns everything DOM-flavored the pure renderer can't:
 * the rAF loop, ResizeObserver + devicePixelRatio backing-store scaling,
 * palette selection (prefers-color-scheme), the reduced-motion pin, the
 * offscreen tile lifecycle, and the idle dirty-flag (home redraws only on
 * boil-frame change — 5 draws/sec).
 */
export function GameView({
  gameStateRef,
  legPoseRef,
  trackLength,
  mode = "play",
}: {
  gameStateRef: MutableRefObject<StateMessage | null>;
  legPoseRef: MutableRefObject<LegPose | null>;
  trackLength: number;
  mode?: "idle" | "play";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tilesRef = useRef<SceneTiles | null>(null);
  const scaleRef = useRef(1); // physical px per scene unit
  const [dark, setDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );

  // OS theme + motion preferences, live.
  useEffect(() => {
    const dm = window.matchMedia("(prefers-color-scheme: dark)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onDark = (e: MediaQueryListEvent) => setDark(e.matches);
    const onMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    dm.addEventListener("change", onDark);
    rm.addEventListener("change", onMotion);
    return () => {
      dm.removeEventListener("change", onDark);
      rm.removeEventListener("change", onMotion);
    };
  }, []);

  // Backing store: clientWidth × dpr (the canvas is CSS-fluid), tiles rebuilt
  // on size/theme change so strokes stay crisp at any DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const palette = dark ? MIDNIGHT_PALETTE : PAPER_PALETTE;

    const fit = () => {
      const cssW = canvas.clientWidth || SCENE_W;
      const dpr = window.devicePixelRatio || 1;
      const scale = (cssW / SCENE_W) * dpr;
      canvas.width = Math.round(SCENE_W * scale);
      canvas.height = Math.round(SCENE_H * scale);
      scaleRef.current = scale;
      tilesRef.current = buildSceneTiles(palette, scale);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [dark]);

  // The draw loop.
  useEffect(() => {
    let raf = 0;
    let lastIdleFrame = -1;
    const palette = dark ? MIDNIGHT_PALETTE : PAPER_PALETTE;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Idle dirty-flag: the home scene only changes on boil ticks.
      if (mode === "idle" && !reducedMotion) {
        const f = boilFrame(t, BOIL_HZ_IDLE);
        if (f === lastIdleFrame) return;
        lastIdleFrame = f;
      } else if (mode === "idle" && reducedMotion && lastIdleFrame === 0) {
        return; // static scene already drawn
      }
      if (mode === "idle" && reducedMotion) lastIdleFrame = 0;

      const scale = scaleRef.current;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      renderGame(ctx, {
        state: gameStateRef.current,
        legPose: legPoseRef.current,
        trackLength,
        nowMs: t,
        mode,
        palette,
        tiles: tilesRef.current,
        reducedMotion,
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameStateRef, legPoseRef, trackLength, mode, dark, reducedMotion]);

  return <canvas ref={canvasRef} className="game-canvas" aria-hidden />;
}
