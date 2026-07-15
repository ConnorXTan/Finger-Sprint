import { useEffect, useRef, type MutableRefObject } from "react";
import type { StateMessage } from "@finger-sprint/shared";
import type { LegPose } from "../game/fingerLegs";
import { renderGame } from "../render/renderGame";

const CANVAS_W = 960;
const CANVAS_H = 540;

/**
 * The game scene. Runs its own animation loop, reading the latest authoritative
 * state and leg pose from refs so it animates at full frame rate without
 * triggering React re-renders.
 */
export function GameView({
  gameStateRef,
  legPoseRef,
  trackLength,
}: {
  gameStateRef: MutableRefObject<StateMessage | null>;
  legPoseRef: MutableRefObject<LegPose | null>;
  trackLength: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = (t: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        renderGame(ctx, canvas.width, canvas.height, {
          state: gameStateRef.current,
          legPose: legPoseRef.current,
          trackLength,
          nowMs: t,
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameStateRef, legPoseRef, trackLength]);

  return <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="game-canvas" />;
}
