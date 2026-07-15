/**
 * Server + game tuning. Everything that controls how finger movement turns into
 * a running character lives here so it's easy to find and tweak.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? "./data/leaderboard.db",

  game: {
    /** Round length. */
    durationMs: 90_000,
    /** Distance units from start to the finish line. An endurance goal sized so
     *  reaching it takes most of the round — most rounds end on the timer. */
    trackLength: 18_000,
    /** Server physics + broadcast tick. Client sends movement at a similar rate. */
    tickMs: 100,

    /* ---- steps -> distance ----
     * Movement is a FLAT step count: the client reports its cumulative total of
     * fingertip crossings, and every accepted step advances the runner exactly
     * one stride. No rates, no acceleration curves — N steps is always N
     * strides of distance. */
    /** Distance units the runner advances per counted step (one stride). */
    distancePerStep: 70,
    /** Max steps accepted per second, and also the burst ceiling of the token
     *  bucket enforcing it (anti-cheat / sanity bound — real finger crossings
     *  top out well below this). */
    maxStepsPerSecond: 12,
    /** Smoothing (0..1 per tick) for the display pace derived from stepping.
     *  Cosmetic only — drives the runner animation and the combo threshold. */
    speedEmaAlpha: 0.15,

    /* ---- scoring ---- */
    /** Base points banked per distance unit covered (before the combo multiplier). */
    distanceToScore: 1,
    /** Bonus score per second left on the clock if you reach the finish line.
     *  Kept modest so it rewards a strong finish without dominating the score. */
    finishTimeBonus: 25,

    /* ---- sustained-effort combo multiplier ----
     * Points banked each tick are multiplied by a combo that grows while you
     * keep the runner above `comboSpeedThreshold` and decays (faster) when you
     * drop below it. Rewards consistent stepping over one-off bursts. */
    /** Pace above which the combo builds (≈2.6 steps/sec at 70 units/step). */
    comboSpeedThreshold: 180,
    /** Multiplier gained per second of sustained speed. */
    comboRampPerSec: 0.4,
    /** Multiplier lost per second below the threshold (decays ~2x faster than it builds). */
    comboDecayPerSec: 0.8,
    /** Hard cap on the multiplier. */
    maxMultiplier: 3,

    /** How long a finished session is retained for /end + /leaderboard submit. */
    retainFinishedMs: 10 * 60_000,
  },
} as const;
