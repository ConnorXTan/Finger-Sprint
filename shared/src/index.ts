/**
 * Finger Sprint — shared API contract.
 *
 * This is the ONLY thing the frontend and backend share. It contains pure
 * TypeScript types (erased at build time, no runtime code) describing the REST
 * responses and the WebSocket messages. If you change a shape here, both sides
 * see it.
 */

/* ------------------------------------------------------------------ */
/* REST                                                                */
/* ------------------------------------------------------------------ */

/** POST /api/session — create a new game session. */
export interface CreateSessionResponse {
  sessionId: string;
  /** Total round length in milliseconds (authoritative, set by the server). */
  durationMs: number;
  /** Distance units from start to the finish line. */
  trackLength: number;
  /** Server clock at creation (epoch ms) — handy for clock-skew display. */
  serverTimeMs: number;
}

/** POST /api/session/:id/end — finalize a session. */
export interface EndSessionResponse {
  sessionId: string;
  score: number;
  distance: number;
  finished: boolean;
  /** Provisional 1-based rank of this score against the persisted leaderboard. */
  rank: number;
  durationMs: number;
}

/** A single persisted leaderboard row. */
export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  distance: number;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** 1-based rank within the returned set. */
  rank: number;
}

/** GET /api/leaderboard — top N scores. */
export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
}

/** POST /api/leaderboard — attach a name to a finished session's score. */
export interface SubmitScoreRequest {
  sessionId: string;
  name: string;
}

export interface SubmitScoreResponse {
  entry: LeaderboardEntry;
}

/** Generic error body returned by REST endpoints on failure. */
export interface ApiError {
  error: string;
}

/* ------------------------------------------------------------------ */
/* WebSocket (live gameplay)                                           */
/* ------------------------------------------------------------------ */

/**
 * client -> server.
 * Sent on a fixed tick (~100ms), NOT every frame. `intensity` is the smoothed,
 * aggregated finger-movement metric computed entirely on the client.
 */
export interface MovementMessage {
  type: "movement";
  sessionId: string;
  intensity: number;
  /** Client epoch ms when the metric was sampled. */
  timestamp: number;
}

/**
 * server -> client.
 * Authoritative game state. The frontend renders exactly this — it does not
 * compute score or distance itself.
 */
export interface StateMessage {
  type: "state";
  /** 0..1 progress along the track (for rendering the finish line). */
  position: number;
  /** Current character speed (distance units / second). */
  speed: number;
  /** Distance covered so far (units). */
  distance: number;
  score: number;
  /** Live sustained-effort combo multiplier applied to incoming points (>= 1). */
  multiplier: number;
  /** Milliseconds left in the round. */
  timeRemaining: number;
  finished: boolean;
}

/** server -> client, on a protocol/session problem. */
export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ClientMessage = MovementMessage;
export type ServerMessage = StateMessage | ErrorMessage;
