// S8-18 (S8-09 step 1, F-offline-2). Pure rules for the server-side ordering of
// evaluation writes. Every write may carry `clientTs` (ms epoch of the cupper's
// edit on the device); the row remembers the newest one it accepted in
// `Evaluation.lastClientWriteAt`, and an OLDER write arriving later (a replay
// that overtook a live save, two devices) is ignored. Dependency-free so
// tests/offlineOrdering.test.ts can import it.
//
// `lastClientWriteAt` is ordering metadata ONLY: scoring, the SQL trigger and
// AggregateScore never read it. Cross-device clock skew is accepted (same user,
// same sample): the latest device clock wins.

import { int } from "@/lib/validate";

/** How far ahead of the server clock a client timestamp may be (clock skew). */
export const CLIENT_TS_MAX_FUTURE_MS = 5 * 60 * 1000;

/**
 * A usable client timestamp, or undefined. An absent, non-numeric, fractional,
 * negative or far-future value is treated as ABSENT, never as an error: old
 * cached bundles omit it and a bad clock must not fail a save.
 */
export function sanitizeClientTs(raw: unknown, now: number = Date.now()): number | undefined {
  if (typeof raw !== "number") return undefined;
  try {
    return int(raw, "clientTs", 1, now + CLIENT_TS_MAX_FUTURE_MS);
  } catch {
    return undefined;
  }
}

/**
 * The timestamp a write is compared and stored with: the sanitized client
 * stamp clamped to the server clock (`min(clientTs, now)`). A client clock that
 * runs fast can then never harden a row beyond "now", so a later honest write
 * (other device, or the same device after its clock is corrected) is not
 * mistaken for a stale one. Undefined when the stamp is absent/unusable.
 *
 * BY DESIGN (S8 audit C-02, accepted): this clamp bounds how far a fast clock
 * can lock out later writes, but it does not make ordering exact. Two tabs or
 * devices still order by arrival when both stamps clamp to the server's "now"
 * (and tests/clientWrite pins that the hole exists). Closing it needs a
 * server-assigned version column (a migration) and is deliberately not done:
 * the client never sends a stale payload on its own path (C-01), and a
 * cupper normally evaluates from one device.
 */
export function effectiveClientTs(clientTs: unknown, now: number = Date.now()): number | undefined {
  const ts = sanitizeClientTs(clientTs, now);
  return ts === undefined ? undefined : Math.min(ts, now);
}

/**
 * Whether a write stamped `clientTs` may be applied over a row whose newest
 * accepted write is `lastClientWriteAt`. Absent on either side applies (legacy
 * bundles and legacy rows keep today's behaviour); equal applies (a re-sent
 * write is idempotent); only strictly older is ignored.
 */
export function shouldApplyClientWrite(
  lastClientWriteAt: Date | number | null | undefined,
  clientTs: unknown,
  now: number = Date.now(),
): boolean {
  const ts = effectiveClientTs(clientTs, now);
  if (ts === undefined) return true;
  if (lastClientWriteAt === null || lastClientWriteAt === undefined) return true;
  const last = lastClientWriteAt instanceof Date ? lastClientWriteAt.getTime() : lastClientWriteAt;
  if (!Number.isFinite(last)) return true;
  return ts >= last;
}
