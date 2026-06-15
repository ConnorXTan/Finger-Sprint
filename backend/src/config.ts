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

    /* ---- intensity -> speed ---- */
    /** Incoming intensity is clamped to this (anti-cheat / sanity bound). */
    maxIntensity: 120,
    /** Target speed (units/s) = intensity * this. */
    intensityToSpeed: 4.5,
    /** Hard cap on character speed regardless of intensity. */
    maxSpeed: 600,
    /** How quickly speed ramps up toward the target (units/s per second). */
    accelPerSec: 900,
    /** How quickly speed bleeds off toward the target / zero. */
    decelPerSec: 700,
    /** If no movement message arrives within this window, intensity is treated
     *  as 0 so the runner coasts to a stop. */
    staleMs: 400,

    /* ---- scoring ---- */
    /** Base points banked per distance unit covered (before the combo multiplier). */
    distanceToScore: 1,
    /** Bonus score per second left on the clock if you reach the finish line.
     *  Kept modest so it rewards a strong finish without dominating the score. */
    finishTimeBonus: 25,

    /* ---- sustained-effort combo multiplier ----
     * Points banked each tick are multiplied by a combo that grows while you
     * keep the runner above `comboSpeedThreshold` and decays (faster) when you
     * drop below it. Rewards consistent fast wiggling over one-off bursts. */
    /** Speed above which the combo builds (here ~47% of maxSpeed). */
    comboSpeedThreshold: 280,
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
