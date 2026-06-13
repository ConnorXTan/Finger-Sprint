import type { LeaderboardEntry } from "@finger-sprint/shared";
import { db } from "./db";

/**
 * Data-access boundary for leaderboard persistence. The app depends on this
 * interface, never on SQLite directly — swap the implementation to change DBs.
 */
export interface LeaderboardRepo {
  /** Persist a finished score under a player name; returns the stored entry. */
  insert(name: string, score: number, distance: number): LeaderboardEntry;
  /** Top `limit` scores, highest first. */
  top(limit: number): LeaderboardEntry[];
  /** 1-based rank a given score would occupy (count of strictly-higher + 1). */
  rankForScore(score: number): number;
}

interface ScoreRow {
  id: number;
  name: string;
  score: number;
  distance: number;
  createdAt: string;
}

class SqliteLeaderboardRepo implements LeaderboardRepo {
  private readonly insertStmt = db.prepare(
    "INSERT INTO scores (name, score, distance, created_at) VALUES (?, ?, ?, ?)",
  );
  private readonly topStmt = db.prepare(
    `SELECT id, name, score, distance, created_at AS createdAt
       FROM scores
       ORDER BY score DESC, created_at ASC
       LIMIT ?`,
  );
  private readonly rankStmt = db.prepare(
    "SELECT COUNT(*) AS higher FROM scores WHERE score > ?",
  );

  insert(name: string, score: number, distance: number): LeaderboardEntry {
    const createdAt = new Date().toISOString();
    const info = this.insertStmt.run(name, score, Math.round(distance), createdAt);
    return {
      id: Number(info.lastInsertRowid),
      name,
      score,
      distance: Math.round(distance),
      createdAt,
      rank: this.rankForScore(score),
    };
  }

  top(limit: number): LeaderboardEntry[] {
    const rows = this.topStmt.all(limit) as unknown as ScoreRow[];
    return rows.map((row, i) => ({ ...row, rank: i + 1 }));
  }

  rankForScore(score: number): number {
    const row = this.rankStmt.get(score) as unknown as { higher: number };
    return Number(row.higher) + 1;
  }
}

export const leaderboardRepo: LeaderboardRepo = new SqliteLeaderboardRepo();
