import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry } from "@finger-sprint/shared";
import { getLeaderboard } from "../net/gameClient";

/**
 * Top scores. `refreshKey` lets a parent force a reload (e.g. after a submit).
 * `highlightId` visually marks a freshly-submitted entry.
 */
export function Leaderboard({
  refreshKey = 0,
  highlightId,
  limit = 10,
}: {
  refreshKey?: number;
  highlightId?: number;
  limit?: number;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLeaderboard(limit);
      setEntries(res.entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="leaderboard">
      <header className="leaderboard__head">
        <h2>Leaderboard</h2>
        <button className="btn btn--ghost btn--sm" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">Couldn’t load scores: {error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="muted">No scores yet — be the first!</p>
      )}

      {entries.length > 0 && (
        <ol className="leaderboard__list">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`leaderboard__row${e.id === highlightId ? " is-highlight" : ""}`}
            >
              <span className="leaderboard__rank">#{e.rank}</span>
              <span className="leaderboard__name">{e.name}</span>
              <span className="leaderboard__score">{e.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
