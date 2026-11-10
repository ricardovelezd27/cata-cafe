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

function partsInZone(ms: number, zone: string): { y: number; m: number; d: number; asUtc: number } {
  const base = Math.floor(ms / 1000) * 1000;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
  let t = utcGuess - offsetMs(utcGuess, zone);
  t = utcGuess - offsetMs(t, zone);
  return new Date(t);
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
 *  C3 default, option a). Never a close. */
export const LIVE_IDLE_MS = 12 * 3_600_000;

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

// ─── Manual finish for solo / express sessions (F-express-1, F-solo-3) ───────

export type FinishSampleInput = {
  id: string;
  /** The owner's evaluation row of this sample; null when never opened. */
  evaluation: { isDraft: boolean; complete: boolean } | null;
};

export type FinishPlan = {
  /** Complete drafts to submit. */
  submitIds: string[];
  /** Samples with no evaluation at all: removed (Kim C2 default a). */
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
  for (const s of samples) {
    if (!s.evaluation) removeIds.push(s.id);
    else if (!s.evaluation.isDraft) alreadySubmitted++;
    else if (s.evaluation.complete) submitIds.push(s.id);
    else keptPartialIds.push(s.id);
  }
  const scoredCount = alreadySubmitted + submitIds.length;
  return { submitIds, removeIds, keptPartialIds, scoredCount, canFinish: scoredCount > 0 };
}
