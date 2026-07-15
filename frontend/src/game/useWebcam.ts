import { useCallback, useEffect, useRef, useState } from "react";

export type WebcamStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "notfound"
  | "busy"
  | "unsupported"
  | "error";

/**
 * Map a getUserMedia rejection to a user-presentable status. Covers every
 * DOMException name browsers actually throw; anything unknown falls through to
 * "error" so the raw message can be shown.
 */
export function statusForGetUserMediaError(e: unknown): WebcamStatus {
  switch ((e as DOMException)?.name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "notfound";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy"; // camera exists but the OS/another app is holding it
    case "NotSupportedError":
    case "TypeError": // insecure context: mediaDevices exists but gUM rejects
      return "unsupported";
    default:
      return "error";
  }
}

/**
 * Webcam capture via getUserMedia, with explicit, user-presentable states for
 * the things that go wrong: API unsupported, permission denied, no camera,
 * camera busy.
 */
export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<WebcamStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return false;
    }
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("error");
        setError("video element not mounted");
        return false;
      }
      video.srcObject = stream;
      await video.play();
      setStatus("ready");
      return true;
    } catch (e) {
      const mapped = statusForGetUserMediaError(e);
      setStatus(mapped);
      if (mapped === "error") setError((e as DOMException)?.message ?? String(e));
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  // Release the camera if the component unmounts.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { videoRef, status, error, start, stop };
}
