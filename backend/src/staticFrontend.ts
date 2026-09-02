import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";

/**
 * In production the backend is the only server, so it also serves the built
 * frontend (frontend/dist) and answers deep links with index.html. In dev,
 * Vite serves the frontend and proxies /api + /ws here instead — the dist
 * directory usually doesn't exist, and mounting is skipped entirely.
 */

/** Directories accepted as the frontend build output, first hit wins.
 *  FRONTEND_DIST overrides; otherwise we try the repo root as cwd (how the
 *  deploy host starts us) and backend/ as cwd (local `npm start`). */
export function frontendDistCandidates(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [
    join(cwd, "frontend", "dist"),
    join(cwd, "..", "frontend", "dist"),
  ];
  return env.FRONTEND_DIST ? [resolve(env.FRONTEND_DIST), ...candidates] : candidates;
}

/** First candidate that actually contains a built index.html, or null. */
export function resolveFrontendDist(candidates: string[]): string | null {
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

/** The SPA fallback must never swallow API or WebSocket paths. */
export function isSpaPath(path: string): boolean {
  return !/^\/(?:api|ws)(?:\/|$)/.test(path);
}

/**
 * Serve the built frontend with an index.html fallback for client-side routes.
 * Returns the directory being served, or null when no build exists (dev mode).
 */
export function mountStaticFrontend(
  app: Express,
  candidates: string[] = frontendDistCandidates(),
): string | null {
  const dist = resolveFrontendDist(candidates);
  if (!dist) return null;
  app.use(express.static(dist));
  app.get("*", (req: Request, res: Response, next: NextFunction) => {
    if (!isSpaPath(req.path)) return next();
    res.sendFile(join(dist, "index.html"));
  });
  return dist;
}
