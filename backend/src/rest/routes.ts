import { Router } from "express";
import type {
  CreateSessionResponse,
  EndSessionResponse,
  GetLeaderboardResponse,
  SubmitScoreResponse,
} from "@finger-sprint/shared";
import { config } from "../config";
import { createSession, getSession } from "../game/sessionStore";
import { leaderboardRepo } from "../db/leaderboardRepo";

export const apiRouter = Router();

/** POST /api/session — create a session and return its id + round config. */
apiRouter.post("/session", (_req, res) => {
  const session = createSession();
  const body: CreateSessionResponse = {
    sessionId: session.id,
    durationMs: config.game.durationMs,
    trackLength: config.game.trackLength,
    serverTimeMs: Date.now(),
  };
  res.status(201).json(body);
});

/** POST /api/session/:id/end — finalize the session and return score + rank. */
apiRouter.post("/session/:id/end", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  const snap = session.end(Date.now());
  const body: EndSessionResponse = {
    sessionId: session.id,
    score: snap.score,
    distance: snap.distance,
    finished: snap.finished,
    rank: leaderboardRepo.rankForScore(snap.score),
    durationMs: config.game.durationMs,
  };
  res.json(body);
});

/** GET /api/leaderboard?limit=N — top scores (default 10, max 100). */
apiRouter.get("/leaderboard", (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 10) || 10));
  const body: GetLeaderboardResponse = { entries: leaderboardRepo.top(limit) };
  res.json(body);
});

/** POST /api/leaderboard — attach a name to a finished session's score. */
apiRouter.post("/leaderboard", (req, res) => {
  const { sessionId, name } = (req.body ?? {}) as { sessionId?: unknown; name?: unknown };

  if (typeof sessionId !== "string" || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "sessionId and a non-empty name are required" });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (session.status !== "finished") {
    res.status(409).json({ error: "session is not finished yet" });
    return;
  }

  // One leaderboard entry per session: a repeat submit (client retry, or an
  // attempt to spam the board with the same score) returns the existing entry.
  if (session.leaderboardEntry) {
    res.json({ entry: session.leaderboardEntry } satisfies SubmitScoreResponse);
    return;
  }

  const cleanName = name.trim().slice(0, 24);
  const entry = leaderboardRepo.insert(cleanName, session.score, session.distance);
  session.leaderboardEntry = entry;
  const body: SubmitScoreResponse = { entry };
  res.status(201).json(body);
});
