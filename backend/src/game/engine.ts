import type { StateMessage } from "@finger-sprint/shared";
import { config } from "../config";

const G = config.game;

export type SessionStatus = "created" | "running" | "finished";

/**
 * One authoritative game session. The server — not the client — owns speed,
 * distance and score. The client only feeds in a movement-intensity number; the
 * physics loop here decides what actually happens.
 */
export class GameSession {
  readonly id: string;
  readonly createdAt = Date.now();
  status: SessionStatus = "created";
  finishedAt = 0;

  // Authoritative state.
  speed = 0;
  distance = 0;
  score = 0;
  multiplier = 1;
  finished = false;

  /** Running, banked score (distance covered each tick × the live multiplier). */
  private scoreAcc = 0;

  // Internal clock / input bookkeeping.
  private startTime = 0;
  private lastTickTime = 0;
  private intensity = 0;
  private lastMovementTime = 0;

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
      this.lastMovementTime = now;
      this.timer = setInterval(() => this.tick(Date.now()), G.tickMs);
    }
    this.emit(now);
  }

  /** Record the latest client movement intensity (clamped for sanity). */
  applyMovement(intensity: number, now: number): void {
    this.intensity = Math.max(0, Math.min(G.maxIntensity, intensity));
    this.lastMovementTime = now;
  }

  private tick(now: number): void {
    if (this.status !== "running") return;
    const dt = Math.max(0, (now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    // Drop intensity to 0 if the client has gone quiet (disconnect / stopped).
    const stale = now - this.lastMovementTime > G.staleMs;
    const effectiveIntensity = stale ? 0 : this.intensity;

    // Acceleration curve: ease the current speed toward a target derived from
    // intensity, with separate ramp-up / ramp-down rates. This gives momentum —
    // a flick of the fingers doesn't instantly teleport the runner.
    const targetSpeed = Math.min(G.maxSpeed, effectiveIntensity * G.intensityToSpeed);
    if (targetSpeed > this.speed) {
      this.speed = Math.min(targetSpeed, this.speed + G.accelPerSec * dt);
    } else {
      this.speed = Math.max(targetSpeed, this.speed - G.decelPerSec * dt);
    }

    const distanceGained = this.speed * dt;
    this.distance += distanceGained;

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
