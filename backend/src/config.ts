/**
 * Server + game tuning. Everything that controls how finger movement turns into
 * a running character lives here so it's easy to find and tweak.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? "./data/leaderboard.db",

  game: {
    /** Round length. */
    durationMs: 30_000,
    /** Distance units from start to the finish line. */
    trackLength: 1_000,
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
    /** Score awarded per distance unit covered. */
    distanceToScore: 1,
    /** Bonus score per second left on the clock if you reach the finish line. */
    finishTimeBonus: 50,

    /** How long a finished session is retained for /end + /leaderboard submit. */
    retainFinishedMs: 10 * 60_000,
  },
} as const;
