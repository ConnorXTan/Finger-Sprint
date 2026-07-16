import { useEffect, useRef, type RefObject, type MutableRefObject } from "react";
import { drawHandOverlay } from "../render/renderGame";
import type { Landmark } from "../game/handTracker";
import { MIDNIGHT_PALETTE, PAPER_PALETTE } from "../render/ink";
import { COPY } from "../copy";
import { THUMB_BORDER } from "../render/inkSvg";

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
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        drawHandOverlay(
          ctx,
          canvas.width,
          canvas.height,
          landmarksRef.current,
          dark ? MIDNIGHT_PALETTE : PAPER_PALETTE,
        );
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [landmarksRef]);

  return (
    <div className="webcam-thumb" style={{ width, height }}>
      <svg
        className="ink-border"
        viewBox={THUMB_BORDER.viewBox}
        preserveAspectRatio="none"
        aria-hidden
      >
        {THUMB_BORDER.paths.map((d, i) => (
          <path key={i} className="ink-border__stroke" d={d} />
        ))}
      </svg>
      <video ref={videoRef} className="webcam-thumb__video" playsInline muted />
      <canvas ref={canvasRef} width={width} height={height} className="webcam-thumb__overlay" />
      <span className="webcam-thumb__caption">{COPY.thumb.caption}</span>
    </div>
  );
}
