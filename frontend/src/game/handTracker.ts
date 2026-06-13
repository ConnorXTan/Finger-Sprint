import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HAND_MODEL_URL, MEDIAPIPE_WASM } from "../config";
import type { Landmark } from "./movementIntensity";

export interface HandFrame {
  /** 21 landmarks for the first detected hand, or null if none. */
  landmarks: Landmark[] | null;
}

export interface HandTracker {
  detect(video: HTMLVideoElement, timeMs: number): HandFrame;
  close(): void;
}

/**
 * Thin wrapper around MediaPipe's HandLandmarker. All hand tracking runs in the
 * browser — video frames never leave the device. The heavy WASM + model assets
 * load lazily from a CDN (see config.ts).
 */
export async function createHandTracker(): Promise<HandTracker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 1,
  });

  return {
    detect(video, timeMs) {
      // `timeMs` must be monotonically increasing across calls.
      const result = landmarker.detectForVideo(video, timeMs);
      return { landmarks: result.landmarks?.[0] ?? null };
    },
    close() {
      landmarker.close();
    },
  };
}
