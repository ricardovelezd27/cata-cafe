// Pure rules for how a session closes (S8-05). No Prisma, no Next imports, so
// everything here is unit-tested (tests/closeRules.test.ts, closesAtZone.test.ts,
// finalizeClose.test.ts) and shared by the close routine, the cron, the
// dialogs and the forms.

import { isEvaluationComplete as isScoreComplete } from "@/lib/evaluationState";
import type { SessionFormat } from "@/lib/constants";

// ─── Draft policy at close (Kim C1) ──────────────────────────────────────────

/** What happens to a cupper's complete-but-unsent evaluations when the session
 *  closes. Kim's default (C1 option b): they are left OUT of the results, the
 *  owner is told before closing, the cupper after. They stay in the database,
 *  unless the owner accepts one afterwards (S10 WP4b, `acceptLateEvaluation`,
 *  `TODO(kim-validar:C1)`; the pure rule is `isAcceptableLate` in
 *  lib/lateContributions.ts).
 *  "promote_complete" is C1 option (a): submit complete drafts inside
 *  closeSessionInternal before the flip. It is OFF; nothing reads it yet. */
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

/** A live session the idle pass would close: same shape as isLiveIdle (group,
 *  not async, no `closesAt`, active, started; idle = time since max(startedAt,
 *  last evaluation update)) AND `idleCloseDecision` says "emails" or "silent".
 *  Never started and solo sessions are never abandoned. Pure.
 *  TODO(kim-validar:C3) */
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
  const idle = liveIdleMs(row, lastEvaluationAt, now);
  return idle !== null && idleCloseDecision({ startedAt: row.startedAt, idleMs: idle }) !== "none";
}

/** How long a live session has been idle: now minus max(startedAt, last
 *  evaluation update). `null` when the session is not a live one (solo, async,
 *  dated, not active, never started). "Activity" is an evaluation being saved,
 *  nothing else. Pure. */
export function liveIdleMs(
  row: {
    isGroup: boolean;
    isAsync: boolean;
    closesAt: Date | null;
    status: string;
    startedAt: Date | null;
  },
  lastEvaluationAt: Date | null,
  now: number = Date.now(),
): number | null {
  if (!row.isGroup || row.isAsync || row.closesAt || row.status !== "active") return null;
  if (!row.startedAt) return null;
  const last = Math.max(row.startedAt.getTime(), lastEvaluationAt ? lastEvaluationAt.getTime() : 0);
  return now - last;
}

/** Idle this long or more: the cron closes the session WITHOUT sending the
 *  close emails (S10 WP4a review H2). The first production run would otherwise
 *  mail every participant of every session abandoned months ago. The daily job
 *  means that, after its first week, only that backlog can cross this age.
 *  TODO(kim-validar:C3) */
export const IDLE_SILENT_CLOSE_MS = 30 * 24 * 3_600_000;

/** The day the idle auto-close ships. A session STARTED before it is
 *  "grandfathered": its organiser was told by the old reminder "No la cerramos
 *  por ti", so it is never closed WITH emails by the idle pass; it is closed
 *  (silently) only after 30 idle days. A session started ON or AFTER this
 *  instant follows the designed rule (7 idle days = emails, 30 = silent).
 *  The PHASE 28 dry run carries the same instant as one literal;
 *  tests/closeRulesGrandfather.test.ts checks the two are equal.
 *  TODO(kim-validar:C3) */
export const IDLE_RULE_EFFECTIVE_AT = new Date("2026-11-18T00:00:00Z");

/** Started before the idle rule existed. A session that never started is not
 *  grandfathered (the idle pass never touches it anyway). Pure. */
export function isGrandfatheredIdle(startedAt: Date | null): boolean {
  return startedAt !== null && startedAt.getTime() < IDLE_RULE_EFFECTIVE_AT.getTime();
}

export type IdleCloseDecision = "none" | "emails" | "silent";

/** THE idle rule (S10 WP4a, owner decision 2026-11): what the idle pass does
 *  with a live session idle for `idleMs`.
 *    started ON/AFTER IDLE_RULE_EFFECTIVE_AT: < 7 d none; 7 d to < 30 d emails; >= 30 d silent
 *    started BEFORE it (grandfathered):       < 30 d none; >= 30 d silent; never emails
 *    never started (startedAt null):          none
 *  Every other idle decision (candidate query, reminder, repair pass, the owner's
 *  "closed silently" line) goes through this function. Pure.
 *  TODO(kim-validar:C3) */
export function idleCloseDecision(input: { startedAt: Date | null; idleMs: number }): IdleCloseDecision {
  if (input.startedAt === null) return "none";
  if (input.idleMs >= IDLE_SILENT_CLOSE_MS) return "silent";
  if (isGrandfatheredIdle(input.startedAt)) return "none";
  return input.idleMs >= LIVE_AUTO_CLOSE_MS ? "emails" : "none";
}

/** The close routine's email mode for a decision that closes a session
 *  (`skip` stamps closeFinalizedAt; if a step failed the stamp stays null and the
 *  repair pass applies `repairEmailMode`, silent for the same sessions). */
export function emailModeForIdleDecision(d: Exclude<IdleCloseDecision, "none">): "await" | "skip" {
  return d === "silent" ? "skip" : "await";
}

/** Candidate bands of the idle pass, mirroring `idleCloseDecision`, so a
 *  grandfathered session idle under 30 days is not even fetched (it could fill
 *  the walk). A session is a candidate of a band when it STARTED in
 *  [startedFrom, startedBefore), at or before `startedAtMost`, and no
 *  evaluation was saved after `activityAfter`. Pure. */
export type IdleCandidateBand = {
  startedFrom?: Date;
  startedBefore?: Date;
  startedAtMost: Date;
  activityAfter: Date;
};
export function idleCandidateBands(now: number): IdleCandidateBand[] {
  const c7 = new Date(now - LIVE_AUTO_CLOSE_MS);
  const c30 = new Date(now - IDLE_SILENT_CLOSE_MS);
  return [
    // grandfathered: only once they reach 30 idle days
    { startedBefore: IDLE_RULE_EFFECTIVE_AT, startedAtMost: c30, activityAfter: c30 },
    // started on or after the rule: from 7 idle days
    { startedFrom: IDLE_RULE_EFFECTIVE_AT, startedAtMost: c7, activityAfter: c7 },
  ];
}

/** Should the owner get the 24 h "nobody is cupping" reminder now? Idle for
 *  LIVE_IDLE_MS and the idle rule would still do nothing (under 7 days), AND the
 *  session is NOT grandfathered: a session that started before the rule existed
 *  must never be promised a 7-day close it will not get, and its organiser may
 *  already have had the old reminder (the ledger is once per session). Pure. */
export function shouldSendLiveIdleReminder(
  row: Parameters<typeof isLiveIdle>[0],
  lastEvaluationAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (isGrandfatheredIdle(row.startedAt)) return false;
  return isLiveIdle(row, lastEvaluationAt, now) && !isLiveAbandoned(row, lastEvaluationAt, now);
}

/** Idle time AT the moment a live session was closed: closedAt minus the later
 *  of startedAt and the last evaluation update at or before `closedAt`. The
 *  finalize's aggregate re-fire is raw SQL and does not bump `updatedAt`; the
 *  `<= closedAt` filter matters for LATER Prisma writes (a guest merge, an
 *  account deletion) which do, and must not make the session look recently
 *  active. `null` when the session never started or is not closed. Pure. */
export function idleAtCloseMs(
  row: { startedAt: Date | null; closedAt: Date | null },
  lastEvaluationBeforeCloseAt: Date | null,
): number | null {
  if (!row.startedAt || !row.closedAt) return null;
  const last = Math.max(row.startedAt.getTime(), lastEvaluationBeforeCloseAt ? lastEvaluationBeforeCloseAt.getTime() : 0);
  return row.closedAt.getTime() - last;
}

/** Was this close a SILENT one (S10 WP4a second review M-A, and the owner's
 *  results-page line)? True exactly when the session is a live group session
 *  (group, not async, no closesAt), `idleCloseDecision` says "silent" for the idle
 *  it had AT closedAt (30 days or more, grandfathered or not), and nobody ever
 *  started emailing it (no close_email_deliveries row at all). Pure.
 *  TODO(kim-validar:C3) */
export function closedSilently(input: {
  isLiveGroup: boolean;
  startedAt: Date | null;
  idleAtCloseMs: number | null;
  closeEmailLedgerRows: number;
}): boolean {
  return (
    input.isLiveGroup &&
    input.idleAtCloseMs !== null &&
    idleCloseDecision({ startedAt: input.startedAt, idleMs: input.idleAtCloseMs }) === "silent" &&
    input.closeEmailLedgerRows === 0
  );
}

/** Email mode of the cron REPAIR pass for a closed-but-unfinalized session.
 *  "skip" when the close was silent (`closedSilently`), so a silent idle close
 *  whose finalize failed halfway is repaired WITHOUT mailing the months-old
 *  backlog the next day, or when the creator is a deleted-account placeholder
 *  (account deletion closes with emails "skip"; a failed finalize must not email
 *  later). "await" otherwise (deadline sessions and every session somebody
 *  already started emailing keep today's behaviour). A grandfathered session is
 *  only ever closed by the idle pass at 30 idle days or more, i.e. silently, so
 *  its repair agrees without an extra case.
 *  Known and accepted: an OWNER who closed by hand a live session that had been
 *  idle 30+ days, and whose finalize failed before the email step, is repaired
 *  without emails too; their results page says so and "Reenviar correos" sends
 *  them. No migration: derived from closedAt, startedAt, the evaluations, the
 *  ledger and the creator id. Pure. TODO(kim-validar:C3)
 *  KNOWN CONSEQUENCE of the deleted-creator rule (documented, not changed; S10
 *  leftovers B1): a session closed by its DEADLINE whose first finalize failed,
 *  whose organiser deleted the account before the repair ran, is repaired
 *  WITHOUT emails, so its participants never get the close email (they still see
 *  the results in the app). Pinned by tests/repairEmailModeLeftovers.test.ts;
 *  docs/flows.md section 1, runbook section 33. */
export function repairEmailMode(input: {
  isLiveGroup: boolean;
  startedAt: Date | null;
  idleAtCloseMs: number | null;
  closeEmailLedgerRows: number;
  /** createdBy is a deleted-account placeholder (isDeletedProfileId). */
  ownerDeleted?: boolean;
}): "await" | "skip" {
  if (input.ownerDeleted) return "skip";
  return closedSilently(input) ? "skip" : "await";
}

/** Time budget (S10 WP4a review M1): the cron has maxDuration 300 s; it stops
 *  STARTING new closes once this much has elapsed so a slow run cannot be
 *  killed in the middle of one. */
export const CRON_CLOSE_START_BUDGET_MS = 150_000;

/** May the cron start another close? Pure. */
export function mayStartAnotherClose(elapsedMs: number, budgetMs: number = CRON_CLOSE_START_BUDGET_MS): boolean {
  return elapsedMs < budgetMs;
}

/** Whether the results page offers the owner "Cerrar ahora" (S10 WP4a review
 *  M2): the OWNER of a GROUP session whose closing date has passed but that is
 *  not closed yet. `closeSession` already accepts expired sessions. Pure. */
export function canCloseNow(input: {
  isOwner: boolean;
  isGroup: boolean;
  status: string;
  expired: boolean;
}): boolean {
  return input.isOwner && input.isGroup && input.status !== "closed" && input.expired;
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
