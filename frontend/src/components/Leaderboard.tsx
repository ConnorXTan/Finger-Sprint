import { useCallback, useEffect, useState } from "react";
import type { LeaderboardEntry } from "@finger-sprint/shared";
import { getLeaderboard } from "../net/gameClient";
import { COPY } from "../copy";
import { InkButton, InkErrorLine, InkPanel } from "./InkChrome";

/**
 * Top scores in the ink language. `refreshKey` lets a parent force a reload
 * (e.g. after a submit). `highlightId` marks a fresh entry red (the own-row —
 * one of the four budgeted red marks). `pinned` shows an off-board player
 * their rank below the top-10 so "where did I land?" is never empty.
 */
export function Leaderboard({
  refreshKey = 0,
  highlightId,
  pinned,
  limit = 10,
}: {
  refreshKey?: number;
  highlightId?: number;
  /** Off-board own entry: rendered below the list with an ellipsis gap. */
  pinned?: { name: string; score: number; rank: number } | null;
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

  const pinnedOffBoard = pinned && !entries.some((e) => e.id === highlightId);
  const lastOnBoard = entries[entries.length - 1];
  const gap =
    pinnedOffBoard && lastOnBoard && entries.length >= limit
      ? lastOnBoard.score - pinned.score
      : null;

  return (
    <InkPanel className="leaderboard">
      <header className="leaderboard__head">
        <h2>{COPY.leaderboard.heading}</h2>
        <InkButton className="ink-btn--sm" onClick={() => void load()}>
          {COPY.leaderboard.refresh}
        </InkButton>
      </header>

      {loading && <p className="muted">{COPY.leaderboard.loading}</p>}
      {error && (
        <InkErrorLine>
          {COPY.leaderboard.error}: {error}
        </InkErrorLine>
      )}

      {!loading && !error && entries.length === 0 && <EmptyBoard />}

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
          {pinnedOffBoard && (
            <>
              <li className="leaderboard__gap" aria-hidden>
                · · ·
              </li>
              <li className="leaderboard__row is-highlight">
                <span className="leaderboard__rank">#{pinned.rank}</span>
                <span className="leaderboard__name">{pinned.name}</span>
                <span className="leaderboard__score">{pinned.score.toLocaleString()}</span>
              </li>
              {gap !== null && gap > 0 && (
                <li className="leaderboard__gap">{COPY.results.gapToTop(gap)}</li>
              )}
            </>
          )}
        </ol>
      )}
    </InkPanel>
  );
}

/** Empty state: a little ink runner, not "No items found." */
function EmptyBoard() {
  return (
    <div className="leaderboard__empty">
      <svg viewBox="0 0 72 84" aria-hidden>
        {/* mini standing runner, mid-doodle */}
        <circle cx="36" cy="18" r="10" />
        <path d="M36 28 L36 52" />
        <path d="M36 36 L24 46" />
        <path d="M36 36 L48 44" />
        <path d="M36 52 L26 70" />
        <path d="M36 52 L46 68 L52 66" />
        <path d="M14 78 C30 74 46 80 62 76" />
      </svg>
      <p className="muted">{COPY.leaderboard.empty}</p>
    </div>
  );
}
