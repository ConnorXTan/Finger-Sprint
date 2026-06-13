import type {
  CreateSessionResponse,
  EndSessionResponse,
  GetLeaderboardResponse,
  MovementMessage,
  StateMessage,
  SubmitScoreResponse,
} from "@finger-sprint/shared";
import { API_BASE, wsUrl } from "../config";

/* ----------------------------- REST helpers ----------------------------- */

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createSession(): Promise<CreateSessionResponse> {
  return fetch(`${API_BASE}/session`, { method: "POST" }).then(asJson<CreateSessionResponse>);
}

export function endSession(sessionId: string): Promise<EndSessionResponse> {
  return fetch(`${API_BASE}/session/${sessionId}/end`, { method: "POST" }).then(
    asJson<EndSessionResponse>,
  );
}

export function getLeaderboard(limit = 10): Promise<GetLeaderboardResponse> {
  return fetch(`${API_BASE}/leaderboard?limit=${limit}`).then(asJson<GetLeaderboardResponse>);
}

export function submitScore(sessionId: string, name: string): Promise<SubmitScoreResponse> {
  return fetch(`${API_BASE}/leaderboard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, name }),
  }).then(asJson<SubmitScoreResponse>);
}

/* --------------------------- WebSocket channel -------------------------- */

/**
 * Live gameplay socket. Sends movement metrics, receives authoritative state.
 * The client never computes score/distance — it only renders what arrives here.
 */
export class GameConnection {
  private ws: WebSocket | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly onState: (state: StateMessage) => void,
    private readonly onClose?: () => void,
  ) {}

  /** Resolves once the socket is open (or rejects on connection error). */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl(this.sessionId));
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
      ws.onclose = () => this.onClose?.();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "state") this.onState(msg as StateMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
    });
  }

  sendMovement(intensity: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: MovementMessage = {
      type: "movement",
      sessionId: this.sessionId,
      intensity,
      timestamp: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
