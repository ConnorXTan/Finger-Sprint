import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "../config";

/**
 * SQLite connection. We use Node's built-in `node:sqlite` (no native build step)
 * so the project runs with a plain `npm install`. It's experimental, hence the
 * `--disable-warning=ExperimentalWarning` flag in the dev/start scripts.
 *
 * Everything DB-specific is confined to this file and `leaderboardRepo.ts`; the
 * rest of the app talks to the `LeaderboardRepo` interface, so swapping SQLite
 * for Postgres later means writing one new repo implementation.
 */
const dbPath = resolve(config.dbPath);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    distance   INTEGER NOT NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_score ON scores (score DESC);
`);
