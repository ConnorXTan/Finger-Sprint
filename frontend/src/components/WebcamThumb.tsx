import { useEffect, useRef, type RefObject, type MutableRefObject } from "react";
import { drawHandOverlay } from "../render/renderGame";
import type { Landmark } from "../game/handTracker";
import { MIDNIGHT_PALETTE, PAPER_PALETTE } from "../render/ink";
import { COPY } from "../copy";
import { THUMB_BORDER } from "../render/inkSvg";
import { BorderSvg } from "./InkChrome";

/**
 * Small selfie-view webcam preview, sketch-framed, with the live hand drawn as
 * ink contours (index + middle bold — they are the legs). Holds the single
 * <video> element the tracker reads from, so it stays mounted for the whole
 * tracking lifetime (ready -> playing -> finished).
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
    // Created once, read per frame — a fresh matchMedia per rAF allocates a
    // MediaQueryList 60x/sec for nothing.
    const dm = window.matchMedia?.("(prefers-color-scheme: dark)");
    const dpr = window.devicePixelRatio || 1;
    let lastDrawn: Landmark[] | null | undefined; // undefined = never drawn

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const landmarks = landmarksRef.current;
      if (landmarks === lastDrawn) return; // tracker hasn't produced a new frame
      lastDrawn = landmarks;
      // DPR-aware backing store so the ink contours stay crisp on retina.
      const w = Math.round(canvas.clientWidth * dpr) || width * dpr;
      const h = Math.round(canvas.clientHeight * dpr) || height * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawHandOverlay(ctx, w, h, landmarks, dm?.matches ? MIDNIGHT_PALETTE : PAPER_PALETTE);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef, width, height]);

  return (
    <div className="webcam-thumb" style={{ width, height }}>
      <BorderSvg border={THUMB_BORDER} />
      <video ref={videoRef} className="webcam-thumb__video" playsInline muted />
      <canvas ref={canvasRef} className="webcam-thumb__overlay" />
      <span className="webcam-thumb__caption">{COPY.thumb.caption}</span>
    </div>
  );
}
