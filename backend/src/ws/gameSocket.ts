import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type {
  ClientMessage,
  ErrorMessage,
  StateMessage,
} from "@finger-sprint/shared";
import { getSession } from "../game/sessionStore";
import type { GameSession } from "../game/engine";

/**
 * WebSocket gameplay channel, mounted at /ws.
 *
 * Flow:
 *   1. Client opens ws://host/ws?sessionId=<id> (id from POST /api/session).
 *   2. We bind the socket to that session and start its authoritative clock.
 *   3. Client sends { type: "movement", ... } every ~100ms.
 *   4. Server pushes { type: "state", ... } every tick until `finished`.
 */
export function attachGameSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let bound: GameSession | undefined;

    const send = (msg: StateMessage | ErrorMessage): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    const bind = (sessionId: string): void => {
      const session = getSession(sessionId);
      if (!session) {
        send({ type: "error", message: "session not found" });
        return;
      }
      bound = session;
      // Start (or re-attach to) the authoritative loop; state flows to this ws.
      session.start((state) => send(state), Date.now());
    };

    // Prefer the sessionId from the query string so the clock starts on connect.
    const url = new URL(req.url ?? "", "http://localhost");
    const querySessionId = url.searchParams.get("sessionId");
    if (querySessionId) bind(querySessionId);

    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // ignore malformed frames
      }
      if (!msg || msg.type !== "movement") return;

      // Lazily bind if the client didn't pass a query param.
      if (!bound && typeof msg.sessionId === "string") bind(msg.sessionId);

      if (bound && msg.sessionId === bound.id) {
        bound.applyMovement(Number(msg.intensity) || 0, Date.now());
      }
    });

    ws.on("close", () => {
      // Intentionally keep the session alive so REST /end and /leaderboard still
      // work after the socket drops. The sweeper evicts it later.
      bound = undefined;
    });
  });

  return wss;
}
