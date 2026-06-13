import { randomUUID } from "node:crypto";
import { config } from "../config";
import { GameSession } from "./engine";

/** In-memory registry of live sessions. Sessions are ephemeral; only finished
 *  scores that a player submits get persisted to the leaderboard DB. */
const sessions = new Map<string, GameSession>();

export function createSession(): GameSession {
  const session = new GameSession(randomUUID());
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): GameSession | undefined {
  return sessions.get(id);
}

export function removeSession(id: string): void {
  sessions.get(id)?.dispose();
  sessions.delete(id);
}

/** Periodically evict finished sessions so the map doesn't grow unbounded. */
export function startSessionSweeper(): void {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      const expired =
        s.status === "finished" && now - s.finishedAt > config.game.retainFinishedMs;
      if (expired) removeSession(id);
    }
  }, 60_000);
  // Don't keep the process alive just for the sweeper.
  timer.unref();
}
