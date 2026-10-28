// Pure rules for the master-led synced warm-up run (S6 warm-up v3, PR3).
//
// The master presses "Empezar con el grupo": `startWarmup` stamps
// `CuppingSession.warmupStartedAt` (= the timeline's t0, the start of
// "Llega"; the intro screen is not part of it). Every waiting room gets the
// same `cupping_sessions` UPDATE and opens the player seeked to
// `now − warmupStartedAt`; a reload / the polling fallback seeks the same
// way using the server clock for skew. No React, no DOM.

import { warmupById } from "./exercises";
import { timelineTotalMs } from "./timeline";

/** Parses a Postgres timestamp from a realtime payload or an API response.
 *  A string without a timezone is UTC (TIMESTAMPTZ always carries one;
 *  this is belt and braces). */
export function parseDbTimestamp(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value !== "string" || !value.trim()) return null;
  const s = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** server − client, so `clientNow + skew ≈ serverNow`. */
export function skewMs(serverNowMs: number, clientNowMs: number): number {
  return serverNowMs - clientNowMs;
}

/** Run length in ms for a session's exercise (session mode: with the bridge). */
export function runLengthMs(exerciseId: string | null | undefined): number {
  const ex = warmupById(exerciseId);
  return ex ? timelineTotalMs(ex, "session") : 0;
}

/** Where to seek when a run is picked up. A live realtime event means
 *  "starting now": clamp to [0, 2 s] so nobody skips the first breath over
 *  a few hundred ms of latency. A poll / reload trusts the clocks. */
export function seekFor(
  warmupStartedAtMs: number,
  clientNowMs: number,
  skew: number,
  opts: { live: boolean },
): number {
  const elapsed = clientNowMs + skew - warmupStartedAtMs;
  if (opts.live) return Math.min(2000, Math.max(0, elapsed));
  return Math.max(0, elapsed);
}

/** Less than 20 s left (or already over): don't auto-open, offer solo. */
export function isMissed(warmupStartedAtMs: number, clientNowMs: number, skew: number, runMs: number): boolean {
  return runMs - (clientNowMs + skew - warmupStartedAtMs) < 20_000;
}

export function isRunning(warmupStartedAtMs: number | null, clientNowMs: number, skew: number, runMs: number): boolean {
  if (warmupStartedAtMs === null || runMs <= 0) return false;
  const elapsed = clientNowMs + skew - warmupStartedAtMs;
  return elapsed >= 0 && elapsed < runMs;
}

export function timeLeftMs(warmupStartedAtMs: number, clientNowMs: number, skew: number, runMs: number): number {
  return Math.max(0, runMs - (clientNowMs + skew - warmupStartedAtMs));
}

/** "3:12" */
export function formatTimeLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Realtime reducer ─────────────────────────────────────────────────────
// Every cupping_sessions UPDATE carries the FULL row (REPLICA IDENTITY FULL),
// so a reference change re-delivers the same warmupStartedAt: edge-detect on
// the last value seen, or a skipped player would reopen.

export interface SyncState {
  /** Last warmupStartedAt (ms) this client acted on; null = none. */
  readonly lastStartedAt: number | null;
}

export type SyncAction =
  | { type: "open"; startedAtMs: number }
  | { type: "stopped" }
  | { type: "none" };

export function warmupSyncReducer(state: SyncState, row: Record<string, unknown>): { state: SyncState; action: SyncAction } {
  const has = "warmupStartedAt" in row || "warmup_started_at" in row;
  if (!has) return { state, action: { type: "none" } };
  const next = parseDbTimestamp(row.warmupStartedAt ?? row.warmup_started_at);
  if (next === null) {
    if (state.lastStartedAt !== null) return { state: { lastStartedAt: null }, action: { type: "stopped" } };
    return { state, action: { type: "none" } };
  }
  if (next === state.lastStartedAt) return { state, action: { type: "none" } };
  return { state: { lastStartedAt: next }, action: { type: "open", startedAtMs: next } };
}
