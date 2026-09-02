import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import {
  frontendDistCandidates,
  isSpaPath,
  mountStaticFrontend,
  resolveFrontendDist,
} from "./staticFrontend";

function distWithIndex(): string {
  const dir = mkdtempSync(join(tmpdir(), "fs-dist-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html>");
  return dir;
}

/** Minimal Express stand-in that records what gets mounted. */
function fakeApp() {
  const used: unknown[] = [];
  const gets: Array<{ path: string; handler: (req: Request, res: Response, next: NextFunction) => void }> = [];
  const app = {
    use: (mw: unknown) => used.push(mw),
    get: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) =>
      gets.push({ path, handler }),
  } as unknown as Express;
  return { app, used, gets };
}

describe("frontendDistCandidates", () => {
  it("tries repo-root and backend-cwd layouts", () => {
    const candidates = frontendDistCandidates("/srv/app", {});
    expect(candidates).toEqual([
      join("/srv/app", "frontend", "dist"),
      join("/srv/app", "..", "frontend", "dist"),
    ]);
  });

  it("puts a FRONTEND_DIST override first, resolved to an absolute path", () => {
    const candidates = frontendDistCandidates("/srv/app", { FRONTEND_DIST: "custom/dist" });
    expect(candidates[0]).toBe(resolve("custom/dist"));
    expect(candidates).toHaveLength(3);
  });
});

describe("resolveFrontendDist", () => {
  it("returns the first candidate containing index.html", () => {
    const dist = distWithIndex();
    expect(resolveFrontendDist(["/nope/never", dist])).toBe(dist);
  });

  it("returns null when no candidate has a build", () => {
    expect(resolveFrontendDist(["/nope/never", "/also/nope"])).toBeNull();
  });
});

describe("isSpaPath", () => {
  it("excludes API and WebSocket paths", () => {
    expect(isSpaPath("/api")).toBe(false);
    expect(isSpaPath("/api/health")).toBe(false);
    expect(isSpaPath("/ws")).toBe(false);
    expect(isSpaPath("/ws/anything")).toBe(false);
  });

  it("includes app routes, including ones that merely start with 'api'", () => {
    expect(isSpaPath("/")).toBe(true);
    expect(isSpaPath("/leaderboard")).toBe(true);
    expect(isSpaPath("/apiary")).toBe(true);
    expect(isSpaPath("/wsx")).toBe(true);
  });
});

describe("mountStaticFrontend", () => {
  it("mounts static serving + SPA fallback when a build exists", () => {
    const dist = distWithIndex();
    const { app, used, gets } = fakeApp();

    expect(mountStaticFrontend(app, [dist])).toBe(dist);
    expect(used).toHaveLength(1); // express.static middleware
    expect(gets).toHaveLength(1);
    expect(gets[0].path).toBe("*");
  });

  it("mounts nothing when no build exists (dev mode)", () => {
    const { app, used, gets } = fakeApp();

    expect(mountStaticFrontend(app, ["/nope/never"])).toBeNull();
    expect(used).toHaveLength(0);
    expect(gets).toHaveLength(0);
  });

  it("fallback serves index.html for app routes and defers API paths", () => {
    const dist = distWithIndex();
    const { app, gets } = fakeApp();
    mountStaticFrontend(app, [dist]);
    const handler = gets[0].handler;

    const sent: string[] = [];
    let nextCalled = false;
    const res = { sendFile: (f: string) => sent.push(f) } as unknown as Response;
    const next = (() => {
      nextCalled = true;
    }) as NextFunction;

    handler({ path: "/some/route" } as Request, res, next);
    expect(sent).toEqual([join(dist, "index.html")]);
    expect(nextCalled).toBe(false);

    sent.length = 0;
    handler({ path: "/api/health" } as Request, res, next);
    expect(sent).toEqual([]);
    expect(nextCalled).toBe(true);
  });
});
