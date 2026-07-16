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
  private opened = false;

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
      ws.onopen = () => {
        this.opened = true;
        resolve();
      };
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
      // A socket that never opened also fires `close` — that's the connect
      // failure path (already surfaced via the rejected promise), not an
      // abnormal mid-round drop. Only report closes after a successful open.
      ws.onclose = () => {
        if (this.opened) this.onClose?.();
      };
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

  /** Report the flat total step count for this round (cumulative, monotonic). */
  sendSteps(steps: number): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: MovementMessage = {
      type: "movement",
      sessionId: this.sessionId,
      steps,
      timestamp: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    // Deliberate close: detach the handler so a delayed close event from a
    // dying socket can't fire the abnormal-disconnect path into a later round.
    if (this.ws) this.ws.onclose = null;
    this.ws?.close();
    this.ws = null;
  }
}
