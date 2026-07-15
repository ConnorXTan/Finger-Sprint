import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { HAND_MODEL_URL, MEDIAPIPE_WASM } from "../config";

/** One MediaPipe hand landmark, in normalized 0..1 image coordinates. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

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
  const make = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
    });

  // Prefer the GPU delegate; fall back to CPU on machines/browsers where WebGL
  // isn't available so tracking still works (just a bit slower).
  let landmarker: HandLandmarker;
  try {
    landmarker = await make("GPU");
  } catch {
    landmarker = await make("CPU");
  }

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
