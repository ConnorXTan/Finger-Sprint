import type { LeaderboardEntry, StateMessage } from "@finger-sprint/shared";
import { config } from "../config";

const G = config.game;

export type SessionStatus = "created" | "running" | "finished";

/**
 * One authoritative game session. The server — not the client — owns steps,
 * distance and score. The client only reports its flat step count (fingertip
 * crossings); every accepted step advances the runner exactly one stride.
 */
export class GameSession {
  readonly id: string;
  readonly createdAt = Date.now();
  status: SessionStatus = "created";
  finishedAt = 0;

  // Authoritative state.
  /** Display pace (units/sec) derived from stepping — cosmetic, not physics. */
  speed = 0;
  distance = 0;
  score = 0;
  multiplier = 1;
  /** Total steps accepted this round. */
  steps = 0;
  finished = false;
  /** Leaderboard entry created for this session, if the score was submitted.
   *  One entry per session — repeat submissions return this one. */
  leaderboardEntry: LeaderboardEntry | null = null;

  /** Running, banked score (distance covered each tick × the live multiplier). */
  private scoreAcc = 0;

  // Internal clock / input bookkeeping.
  private startTime = 0;
  private lastTickTime = 0;
  /** Last cumulative step total reported by the client. */
  private lastClientTotal = 0;
  /** Steps reported since the last tick, waiting to be applied. */
  private pendingSteps = 0;
  /**
   * Token bucket for the step rate cap: refills at maxStepsPerSecond up to a
   * burst ceiling of the same size, so a legitimate burst (frames batched by a
   * browser hiccup) is accepted while sustained input stays capped.
   */
  private stepAllowance: number = G.maxStepsPerSecond;

  private timer: ReturnType<typeof setInterval> | null = null;
  private onState: ((s: StateMessage) => void) | null = null;

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Attach a state listener and (on first call) start the authoritative clock.
   * Called when a WebSocket connects. Safe to call again on reconnect — it just
   * re-points the listener and keeps the existing clock running.
   */
  start(onState: (s: StateMessage) => void, now: number): void {
    this.onState = onState;
    if (this.status === "created") {
      this.status = "running";
      this.startTime = now;
      this.lastTickTime = now;
      this.timer = setInterval(() => this.tick(Date.now()), G.tickMs);
    }
    this.emit(now);
  }

  /**
   * Record the client's cumulative step total. Advancing by the delta between
   * successive totals makes lost/duplicated messages self-healing; negative
   * deltas (out-of-order frames) are ignored.
   */
  applySteps(clientTotalSteps: number): void {
    const total = Math.max(0, Math.floor(clientTotalSteps));
    const delta = total - this.lastClientTotal;
    this.lastClientTotal = total;
    if (delta > 0) this.pendingSteps += delta;
  }

  private tick(now: number): void {
    if (this.status !== "running") return;
    const dt = Math.max(0, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    // Flat step accounting: each accepted step is exactly one stride. The only
    // adjustment is a rate cap far above human finger speed (anti-cheat),
    // enforced as a token bucket so legitimate bursts (frames batched by a
    // browser hiccup) still count — excess beyond it is dropped, never banked.
    this.stepAllowance = Math.min(
      G.maxStepsPerSecond,
      this.stepAllowance + G.maxStepsPerSecond * dt,
    );
    const stepsThisTick = Math.min(this.pendingSteps, Math.floor(this.stepAllowance));
    this.stepAllowance -= stepsThisTick;
    this.pendingSteps = 0;
    this.steps += stepsThisTick;

    const distanceGained = stepsThisTick * G.distancePerStep;
    this.distance += distanceGained;

    // Display pace, eased so the runner animation doesn't stutter between
    // ticks. Cosmetic only — distance/score never derive from it.
    const instSpeed = dt > 0 ? distanceGained / dt : 0;
    this.speed += G.speedEmaAlpha * (instSpeed - this.speed);
    if (stepsThisTick === 0 && this.speed < 1) this.speed = 0;

    // Sustained-effort combo: builds while the runner is fast, bleeds away (and
    // faster than it builds) once you slow down — so you have to keep going.
    if (this.speed >= G.comboSpeedThreshold) {
      this.multiplier = Math.min(G.maxMultiplier, this.multiplier + G.comboRampPerSec * dt);
    } else {
      this.multiplier = Math.max(1, this.multiplier - G.comboDecayPerSec * dt);
    }

    // Bank points for the ground covered this tick, weighted by the live combo.
    this.scoreAcc += distanceGained * G.distanceToScore * this.multiplier;

    const timeRemaining = Math.max(0, G.durationMs - (now - this.startTime));

    if (this.distance >= G.trackLength) {
      // Reached the finish line — win.
      this.distance = G.trackLength;
      this.finish(now, timeRemaining);
      return;
    }
    if (timeRemaining <= 0) {
      // Ran out of time.
      this.finish(now, 0);
      return;
    }

    this.score = Math.round(this.scoreAcc);
    this.emit(now, timeRemaining);
  }

  /** Finalize the banked score, adding the finish-line time bonus if earned. */
  private finalizeScore(timeRemaining: number): number {
    const bonus =
      this.distance >= G.trackLength ? (timeRemaining / 1000) * G.finishTimeBonus : 0;
    return Math.round(this.scoreAcc + bonus);
  }

  private finish(now: number, timeRemaining: number): void {
    this.finished = true;
    this.status = "finished";
    this.finishedAt = now;
    this.score = this.finalizeScore(timeRemaining);
    this.emit(now, 0);
    this.stopTimer();
  }

  /**
   * Force-finish via REST (POST /session/:id/end). Returns the final snapshot.
   * Idempotent: ending an already-finished session just returns its snapshot.
   */
  end(now: number): StateMessage {
    if (this.status === "running") {
      const timeRemaining = Math.max(0, G.durationMs - (now - this.startTime));
      this.finish(now, timeRemaining);
    } else if (this.status === "created") {
      // Never actually played — finish with a zero score.
      this.status = "finished";
      this.finished = true;
      this.finishedAt = now;
    }
    return this.snapshot(0);
  }

  private emit(now: number, timeRemaining?: number): void {
    const remaining = timeRemaining ?? Math.max(0, G.durationMs - (now - this.startTime));
    this.onState?.(this.snapshot(remaining));
  }

  private snapshot(timeRemaining: number): StateMessage {
    return {
      type: "state",
      position: Math.min(1, this.distance / G.trackLength),
      speed: Math.round(this.speed),
      distance: Math.round(this.distance),
      steps: this.steps,
      score: this.score,
      multiplier: Math.round(this.multiplier * 10) / 10,
      timeRemaining: Math.round(timeRemaining),
      finished: this.finished,
    };
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stopTimer();
    this.onState = null;
  }
}
