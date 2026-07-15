import { useEffect, useRef, type RefObject, type MutableRefObject } from "react";
import { drawHandOverlay } from "../render/renderGame";
import type { Landmark } from "../game/handTracker";

/**
 * Small selfie-view webcam preview with the live hand skeleton drawn on top.
 * Holds the single <video> element the tracker reads from, so it stays mounted
 * for the whole tracking lifetime (ready -> playing -> finished).
 */
export function WebcamThumb({
  videoRef,
  landmarksRef,
  width = 220,
}: {
  videoRef: RefObject<HTMLVideoElement>;
  landmarksRef: MutableRefObject<Landmark[] | null>;
  width?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const height = Math.round((width * 3) / 4);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) drawHandOverlay(ctx, canvas.width, canvas.height, landmarksRef.current);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef]);

  return (
    <div className="webcam-thumb" style={{ width, height }}>
      <video ref={videoRef} className="webcam-thumb__video" playsInline muted />
      <canvas ref={canvasRef} width={width} height={height} className="webcam-thumb__overlay" />
    </div>
  );
}
