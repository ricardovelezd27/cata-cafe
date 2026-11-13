// Pure rules for how a session closes (S8-05). No Prisma, no Next imports, so
// everything here is unit-tested (tests/closeRules.test.ts, closesAtZone.test.ts,
// finalizeClose.test.ts) and shared by the close routine, the cron, the
// dialogs and the forms.

import { isEvaluationComplete as isScoreComplete } from "@/lib/evaluationState";
import type { SessionFormat } from "@/lib/constants";

// ─── Draft policy at close (Kim C1) ──────────────────────────────────────────

/** What happens to a cupper's complete-but-unsent evaluations when the session
 *  closes. Kim's default (C1 option b): they are left OUT of the results, the
 *  owner is told before closing, the cupper after. They stay in the database.
 *  "promote_complete" is C1 option (a): submit complete drafts inside
 *  closeSessionInternal before the flip. It is OFF; nothing reads it yet.
 *  // TODO(S8-05/C1-d): the owner "accept late contribution" action is a
 *  post-close write and needs an answer from Kim; not built. */
export type DraftAtClosePolicy = "exclude" | "promote_complete";
export const DRAFT_AT_CLOSE: DraftAtClosePolicy = "exclude";

export type EvaluationRowLike = {
  cupperId: string;
  isDraft: boolean;
  descriptiveData: unknown;
  affectiveData: unknown;
  combinedData: unknown;
};

function asData(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "Complete" in the same sense as the results page and the group aggregate
 *  (lib/evaluationState.ts): every score the format needs is present, so a
 *  draft that passes would have counted had it been sent. */
export function isEvaluationComplete(row: EvaluationRowLike, format: string): boolean {
  const f: SessionFormat =
    format === "descriptive" || format === "affective" ? format : "combined";
  const data = f === "descriptive" ? row.descriptiveData : f === "affective" ? row.affectiveData : row.combinedData;
  return isScoreComplete(f, asData(data));
}

export type UnsentCount = {
  /** Distinct cuppers holding at least one COMPLETE unsent evaluation. */
  cuppers: number;
  /** Complete unsent evaluations in total. */
  evaluations: number;
};

/** Complete-but-unsent work that closing would leave out of the results. */
export function countUnsentComplete(rows: EvaluationRowLike[], format: string): UnsentCount {
  const cuppers = new Set<string>();
  let evaluations = 0;
  for (const r of rows) {
    if (!r.isDraft) continue;
    if (!isEvaluationComplete(r, format)) continue;
    evaluations++;
    cuppers.add(r.cupperId);
  }
  return { cuppers: cuppers.size, evaluations };
}

// ─── Two-phase close (F-solo-1, F-grupal-asincrona-7) ────────────────────────

/** A closed session whose phase 2 (reveal, refire, history, emails) has not
 *  finished is repaired after this grace period, so a close in flight is not
 *  raced by the cron. */
export const FINALIZE_GRACE_MS = 5 * 60_000;

export function needsFinalize(
  row: { status: string; closedAt: Date | null; closeFinalizedAt: Date | null },
  now: number = Date.now(),
  graceMs: number = FINALIZE_GRACE_MS,
): boolean {
  if (row.status !== "closed" || row.closeFinalizedAt) return false;
  // A legacy row without closedAt is old enough by definition.
  if (!row.closedAt) return true;
  return now - row.closedAt.getTime() >= graceMs;
}

// ─── Deadline in the owner's zone (F-grupal-asincrona-4) ─────────────────────

const ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  if (zone === "UTC") return true;
  if (!ZONE_RE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "" / null / undefined / an unknown name → null, which means UTC (the
 *  behaviour before this field existed). */
export function normalizeZone(zone: unknown): string | null {
  return isValidTimeZone(zone) ? zone : null;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsInZone(ms: number, zone: string): { y: number; m: number; d: number; asUtc: number } {
  const base = Math.floor(ms / 1000) * 1000;
  let dtf = DTF_CACHE.get(zone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    DTF_CACHE.set(zone, dtf);
  }
  const get: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(base))) {
    if (p.type !== "literal") get[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(get.year, get.month - 1, get.day, get.hour % 24, get.minute, get.second);
  return { y: get.year, m: get.month, d: get.day, asUtc };
}

function offsetMs(ms: number, zone: string): number {
  return partsInZone(ms, zone).asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant that is 23:59:59.999 on calendar day `value` (YYYY-MM-DD) in
 *  `zone`. A null zone is UTC (legacy rows). Throws Error("invalid_input") on
 *  a malformed date or an unknown zone. Handles daylight-saving changes by
 *  re-reading the offset at the candidate instant. */
export function endOfDayInZone(value: unknown, zone: string | null | undefined): Date {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) throw new Error("invalid_input");
  const utcGuess = new Date(`${value}T23:59:59.999Z`).getTime();
  if (Number.isNaN(utcGuess)) throw new Error("invalid_input");
  if (zone === null || zone === undefined || zone === "") return new Date(utcGuess);
  if (!isValidTimeZone(zone)) throw new Error("invalid_input");
  if (zone === "UTC") return new Date(utcGuess);
  // B-06 / D-07 (S8-22): the two-pass offset correction picked the FIRST
  // 23:59:59.999 on a day whose clocks fall back at midnight (America/Santiago
  // 2026-04-04). Find the first instant of the NEXT local day instead and step
  // back 1 ms. The local date never goes backwards as the instant grows, so a
  // binary search over whole seconds is exact; the window covers every real
  // offset (-12h..+14h) around the next day's UTC midnight.
  const next = new Date(Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)) + 1,
  ));
  const nextValue = next.toISOString().slice(0, 10);
  const midnightUtc = next.getTime();
  // Fast path (every ordinary day): the two-pass offset estimate of the next
  // local midnight, accepted only if it really is the FIRST second of that day.
  let guess = midnightUtc - offsetMs(midnightUtc, zone);
  guess = midnightUtc - offsetMs(guess, zone);
  const guessSec = Math.floor(guess / 1000);
  if (
    dateInZone(guessSec * 1000, zone) === nextValue &&
    dateInZone((guessSec - 1) * 1000, zone) !== nextValue
  ) {
    return new Date(guessSec * 1000 - 1);
  }
  let lo = Math.floor((midnightUtc - 15 * 3_600_000) / 1000); // local date <= value
  let hi = Math.floor((midnightUtc + 13 * 3_600_000) / 1000); // local date >= nextValue
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateInZone(mid * 1000, zone) >= nextValue) hi = mid;
    else lo = mid;
  }
  return new Date(hi * 1000 - 1);
}

/** The calendar day (YYYY-MM-DD) that `instant` falls on in `zone`; null zone
 *  is UTC. Used for the edit form read-back, the min date and the no-op check
 *  in planClosesAtChange. */
export function dateInZone(instant: Date | number, zone: string | null | undefined): string {
  const ms = typeof instant === "number" ? instant : instant.getTime();
  if (!zone || !isValidTimeZone(zone) || zone === "UTC") {
    return new Date(ms).toISOString().slice(0, 10);
  }
  const { y, m, d } = partsInZone(ms, zone);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The IANA zone of the browser running this code (client only; on the server
 *  it is the server's zone). undefined when the runtime cannot say. */
export function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export type DeadlineState = "none" | "open" | "soon" | "passed";
export const DEADLINE_SOON_MS = 24 * 3_600_000;

/** none = no date; soon = under 24 h left; passed = writes already stopped. */
export function deadlineState(
  closesAt: Date | string | number | null | undefined,
  now: number = Date.now(),
): DeadlineState {
  if (closesAt === null || closesAt === undefined) return "none";
  const ms = closesAt instanceof Date ? closesAt.getTime() : new Date(closesAt).getTime();
  if (Number.isNaN(ms)) return "none";
  if (ms < now) return "passed";
  return ms - now <= DEADLINE_SOON_MS ? "soon" : "open";
}

// ─── Reminders (system mail, own ledger) ─────────────────────────────────────

export const REMINDER_KINDS = ["deadline_24h", "live_idle"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** Live sessions with no activity for this long get ONE owner reminder (Kim
 *  C3, S10 WP4a: 24 h, was 12 h). The reminder itself never closes anything.
 *  TODO(kim-validar:C3) */
export const LIVE_IDLE_MS = 24 * 3_600_000;

/** A live session idle this long is closed by the daily cron (reason "idle").
 *  TODO(kim-validar:C3) */
export const LIVE_AUTO_CLOSE_MS = 7 * 24 * 3_600_000;

/** Window for the 24 h deadline reminder: closesAt in (now, now + 24 h]. The
 *  cron runs daily, so a recipient gets it 0 to 24 h ahead; the ledger
 *  dedupes. */
export function deadlineReminderWindow(now: number = Date.now()): { gt: Date; lte: Date } {
  return { gt: new Date(now), lte: new Date(now + DEADLINE_SOON_MS) };
}

/** A live (not async, no date) session is idle when its last activity, or its
 *  start when nobody evaluated yet, is older than LIVE_IDLE_MS. */
export function isLiveIdle(
  row: {
    isGroup: boolean;
    isAsync: boolean;
    closesAt: Date | null;
    status: string;
    startedAt: Date | null;
  },
  lastEvaluationAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (!row.isGroup || row.isAsync || row.closesAt || row.status !== "active") return false;
  if (!row.startedAt) return false; // not started: still in the waiting room
  const last = Math.max(row.startedAt.getTime(), lastEvaluationAt ? lastEvaluationAt.getTime() : 0);
  return now - last >= LIVE_IDLE_MS;
}

/** A live session nobody has touched for LIVE_AUTO_CLOSE_MS: same shape as
 *  isLiveIdle (group, not async, no `closesAt`, active, started; idle = time
 *  since max(startedAt, last evaluation update)). Never started and solo
 *  sessions are never abandoned. Pure. TODO(kim-validar:C3) */
export function isLiveAbandoned(
  row: {
    isGroup: boolean;
    isAsync: boolean;
    closesAt: Date | null;
    status: string;
    startedAt: Date | null;
  },
  lastEvaluationAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (!row.isGroup || row.isAsync || row.closesAt || row.status !== "active") return false;
  if (!row.startedAt) return false;
  const last = Math.max(row.startedAt.getTime(), lastEvaluationAt ? lastEvaluationAt.getTime() : 0);
  return now - last >= LIVE_AUTO_CLOSE_MS;
}

// ─── Manual finish for solo / express sessions (F-express-1, F-solo-3) ───────

export type FinishSampleInput = {
  id: string;
  /** The owner's evaluation row of this sample; null when never opened. */
  evaluation: { isDraft: boolean; complete: boolean } | null;
  /** The sample holds a green-bean (physical) or origin (extrinsic) row. Those
   *  cascade on sample delete, so such a sample is never removed. */
  hasOtherData?: boolean;
  /** The sample is a reference (anchor or free, B1): in anchor mode it is pinned and always has a row; in both modes it is out of the ranking, so it does not
   *  count as something the owner actually scored. */
  isReference?: boolean;
};

export type FinishPlan = {
  /** Complete drafts to submit. */
  submitIds: string[];
  /** Samples with no evaluation AND no other data: removed (Kim C2 default a). */
  removeIds: string[];
  /** Partial drafts: kept in the session, without a score. */
  keptPartialIds: string[];
  /** Samples that will carry a score once the session closes. */
  scoredCount: number;
  /** Closing with nothing scored would leave an empty session. */
  canFinish: boolean;
};

export function planFinish(samples: FinishSampleInput[]): FinishPlan {
  const submitIds: string[] = [];
  const removeIds: string[] = [];
  const keptPartialIds: string[] = [];
  let alreadySubmitted = 0;
  let nonReferenceScored = 0;
  let hasReference = false;
  for (const s of samples) {
    if (s.isReference) hasReference = true;
    if (!s.evaluation) {
      // Physical / extrinsic data would be lost with the row: keep it, unscored.
      // A reference (any rank) is never removed either: in free mode the owner
      // may never score it, but it is the comparison basis of the results.
      if (s.hasOtherData || s.isReference) keptPartialIds.push(s.id);
      else removeIds.push(s.id);
    } else if (!s.evaluation.isDraft) {
      alreadySubmitted++;
      if (!s.isReference) nonReferenceScored++;
    } else if (s.evaluation.complete) {
      submitIds.push(s.id);
      if (!s.isReference) nonReferenceScored++;
    } else keptPartialIds.push(s.id);
  }
  const scoredCount = alreadySubmitted + submitIds.length;
  // With a reference, its row alone must not allow closing: in both reference
  // modes (B1) a reference stays out of the ranking, so nothing would be ranked.
  const canFinish = hasReference ? nonReferenceScored > 0 : scoredCount > 0;
  return { submitIds, removeIds, keptPartialIds, scoredCount, canFinish };
}

/** Grace for the results-page on-view repair. Short (no emails, the owner is
 *  looking at it) but non-zero: with zero grace, opening or refreshing /results
 *  while the normal close is still in its second phase ran finalize concurrently
 *  with it, and a session whose finalize keeps failing retried on every view. */
export const ON_VIEW_REPAIR_GRACE_MS = 20_000;

/** S8-21: the results page repairs a SOLO owner's closed-but-unfinalized
 *  session on render once `graceMs` has passed since the close.
 *  Group sessions are left to the cron because phase 2 sends email. */
export function soloRepairOwedOnView(
  row: {
    status: string;
    isGroup: boolean;
    createdBy: string;
    closedAt: Date | null;
    closeFinalizedAt: Date | null;
  },
  viewerId: string,
  graceMs: number = ON_VIEW_REPAIR_GRACE_MS,
  now: number = Date.now(),
): boolean {
  if (row.isGroup || row.createdBy !== viewerId) return false;
  return needsFinalize(row, now, graceMs);
}
