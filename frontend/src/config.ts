/** Client-side configuration. */

/** REST base path (proxied to the backend by Vite in dev). */
export const API_BASE = "/api";

/** Build the gameplay WebSocket URL for a session (also proxied in dev). */
export function wsUrl(sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws?sessionId=${encodeURIComponent(sessionId)}`;
}

/**
 * MediaPipe assets. These load from a CDN so no model files need to be vendored.
 * For fully offline use, download both and point these at local copies.
 */
export const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** How often we push aggregated movement metrics to the backend (ms). */
export const MOVEMENT_TICK_MS = 100;
