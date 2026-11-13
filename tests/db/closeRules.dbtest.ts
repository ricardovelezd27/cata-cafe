// S10 WP4a (Kim C3, C5): the real RLS function, the PHASE 28 dry run and the idle-close pass,
// against the throwaway local Postgres. The email sender is the only mocked boundary.
// TODO(kim-validar:C3) TODO(kim-validar:C5)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendCloseEmails = vi.fn();
const sendEmail = vi.fn();
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.test" } }, error: null }) } } }),
}));
vi.mock("@/lib/closeEmail", () => ({ sendCloseEmails: (...a: unknown[]) => sendCloseEmails(...a) }));

// One close is made to THROW (by id) so the `catch` path of lib/idleClose.ts really runs.
const hoisted = vi.hoisted(() => ({ throwFor: [] as string[], threw: 0, historyThrows: false }));
// Second review M-A: the history sync (a finalize step) can be made to throw.
vi.mock("@/lib/coffeeHistory", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/coffeeHistory")>();
  return {
    ...orig,
    syncCoffeeHistoryForSession: (id: string) => {
      if (hoisted.historyThrows) throw new Error("history boom");
      return orig.syncCoffeeHistoryForSession(id);
    },
  };
});
vi.mock("@/lib/closeSession", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/closeSession")>();
  return {
    ...orig,
    closeSessionInternal: (id: string, opts: Parameters<typeof orig.closeSessionInternal>[1]) => {
      if (hoisted.throwFor.includes(id)) {
        hoisted.threw += 1;
        throw new Error("boom");
      }
      return orig.closeSessionInternal(id, opts);
    },
  };
});

import { closeIdleLiveSessions } from "@/lib/idleClose";
import { closeSessionInternal } from "@/lib/closeSession";
import { repairClosedSession } from "@/lib/repairClose";
import { IDLE_RULE_EFFECTIVE_AT, IDLE_SILENT_CLOSE_MS, LIVE_AUTO_CLOSE_MS } from "@/lib/closeRules";
import { sendLiveIdleReminders } from "@/lib/reminderEmail";
import { viewerMayReadGroupResults } from "@/lib/sessionState";
import { makeEvaluation, makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

let pg: Client;
beforeAll(async () => {
  pg = await rawClient();
});
afterAll(async () => {
  await pg.end();
});
beforeEach(async () => {
  await resetDb();
  hoisted.throwFor = [];
  hoisted.historyThrows = false;
  hoisted.threw = 0;
  sendCloseEmails.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true });
  sendCloseEmails.mockResolvedValue({ attempted: 0, sent: 0, skipped: 0, failed: 0 });
});

const DAY = 24 * 3_600_000;
// The idle pass runs on a FIXED clock, 100 days after the idle rule shipped, so a session started
// "N days ago" is on the same side of IDLE_RULE_EFFECTIVE_AT whenever this suite runs. Anything the
// pass reads from the database (evaluation updatedAt, closedAt) is written relative to NOW.
const EFF = IDLE_RULE_EFFECTIVE_AT.getTime();
const NOW = EFF + 100 * DAY;

/** A submitted evaluation whose updatedAt is `at`. */
async function evalAt(sampleId: string, sessionId: string, cupperId: string, at: number) {
  const e = await makeEvaluation({ sampleId, sessionId, cupperId, values: 6 });
  return prisma.evaluation.update({ where: { id: e.id }, data: { updatedAt: new Date(at) } });
}

async function asUser<T>(uid: string, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  await pg.query("BEGIN");
  try {
    await pg.query("SET LOCAL ROLE authenticated");
    await pg.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    return await fn(pg.query.bind(pg));
  } finally {
    await pg.query("ROLLBACK");
  }
}

/** Open group session where EVERY participant (owner included) has submitted. */
async function allSubmittedOpen(extra: { closesAt?: Date | null; status?: "active" | "closed" } = {}) {
  const owner = await makeUser({ name: "Owner" });
  const a = await makeUser({ name: "A" });
  const b = await makeUser({ name: "B" });
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    participants: [a, b],
    samples: [{}],
    closesAt: extra.closesAt ?? null,
    status: extra.status ?? "active",
  });
  for (const cupperId of [owner, a, b]) {
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId, values: 6 });
  }
  return { owner, a, b, s };
}

describe("agg_select / can_view_group_results (PHASE 28)", () => {
  it("everyone submitted but the session is open: a participant reads no aggregate, the owner does", async () => {
    const w = await allSubmittedOpen();
    expect(await prisma.aggregateScore.count()).toBe(1); // the trigger still wrote it
    const part = await asUser(w.a, (q) => q("select * from aggregate_scores"));
    expect(part.rows).toHaveLength(0);
    const fn = await asUser(w.a, (q) => q("select public.can_view_group_results($1) as v", [w.s.id]));
    expect(fn.rows[0].v).toBe(false);
    const own = await asUser(w.owner, (q) => q("select * from aggregate_scores"));
    expect(own.rows).toHaveLength(1);
  });

  it("once the session is closed the participant reads it", async () => {
    const w = await allSubmittedOpen({ status: "closed" });
    const part = await asUser(w.a, (q) => q("select * from aggregate_scores"));
    expect(part.rows).toHaveLength(1);
  });

  it("once closesAt has passed (status still active) the participant reads it", async () => {
    const w = await allSubmittedOpen({ closesAt: new Date(Date.now() - 60_000) });
    const part = await asUser(w.a, (q) => q("select * from aggregate_scores"));
    expect(part.rows).toHaveLength(1);
  });

  it("a future closesAt is still hidden from a participant", async () => {
    const w = await allSubmittedOpen({ closesAt: new Date(Date.now() + DAY) });
    const part = await asUser(w.a, (q) => q("select * from aggregate_scores"));
    expect(part.rows).toHaveLength(0);
  });
});

// Review M3: the REAL SQL function against the TypeScript rule on every combination of
// (group?, owner?, status, closing date, everyone submitted?). "Everyone submitted" must change nothing.
describe("can_view_group_results (real SQL) agrees with viewerMayReadGroupResults on every combination", () => {
  it("every (isGroup, isOwner, status, closesAt, everyoneSubmitted) combination", async () => {
    const now = Date.now();
    const closesAts: (Date | null)[] = [null, new Date(now - 3_600_000), new Date(now + 3_600_000)];
    let checked = 0;
    const mismatches: string[] = [];
    for (const isGroup of [true, false])
      for (const status of ["active", "closed"] as const)
        for (const closesAt of closesAts)
          for (const everyoneSubmitted of [true, false]) {
            const owner = await makeUser({ name: "O" });
            const other = await makeUser({ name: "P" });
            const s = await makeSession({ ownerId: owner, isGroup, participants: [other], samples: [{}], status, closesAt });
            if (everyoneSubmitted) {
              for (const cupperId of [owner, other]) {
                await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId, values: 6 });
              }
            }
            for (const isOwner of [true, false]) {
              const viewer = isOwner ? owner : other;
              const sql = await asUser(viewer, (q) => q("select public.can_view_group_results($1) as v", [s.id]));
              const ts = viewerMayReadGroupResults(
                { isGroup, status, closesAt },
                { ownerRead: isOwner },
                now,
              );
              if (sql.rows[0].v !== ts) {
                mismatches.push(JSON.stringify({ isGroup, status, closesAt: closesAt?.toISOString() ?? null, everyoneSubmitted, isOwner, sql: sql.rows[0].v, ts }));
              }
              checked += 1;
            }
          }
    expect(mismatches).toEqual([]);
    expect(checked).toBe(2 * 2 * 3 * 2 * 2);
  }, 120_000);
});

describe("phase28_dry_run.sql against the real schema", () => {
  const dryPath = join(__dirname, "..", "..", "prisma", "sql", "dry-runs", "phase28_dry_run.sql");
  const phasePath = join(__dirname, "..", "..", "prisma", "sql", "rls_and_triggers.sql");

  /** The PHASE 21 body, from the commented rollback of PHASE 28 (what the app had before). */
  function oldFunction(): string {
    const all = readFileSync(phasePath, "utf8").replace(/\r\n/g, "\n");
    const p28 = all.slice(all.indexOf("-- PHASE 28 "));
    const rb = p28.slice(p28.indexOf("--   CREATE OR REPLACE FUNCTION public.can_view_group_results"));
    const lines = rb.split("\n").filter((l) => l.startsWith("--   ")).map((l) => l.slice(5));
    const end = lines.findIndex((l) => l.startsWith("$$;"));
    return lines.slice(0, end + 1).join("\n");
  }
  function newFunction(): string {
    const all = readFileSync(phasePath, "utf8").replace(/\r\n/g, "\n");
    const a = all.indexOf(">>> PHASE 28 statements");
    const b = all.indexOf("<<< end of PHASE 28 statements");
    return all.slice(all.indexOf("\n", a) + 1, b);
  }

  /** `effective` replaces the ONE literal at the top of the DO block (the real file carries the
   *  production date; the sessions below start relative to the real clock). */
  async function runDry(effective?: string): Promise<string> {
    let dry = readFileSync(dryPath, "utf8");
    if (effective) {
      expect(dry.match(/v_effective timestamp := '[^']+';/g)).toHaveLength(1);
      dry = dry.replace(/(v_effective timestamp := ')[^']+(';)/, `$1${effective}$2`);
    }
    try {
      await pg.query(dry);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error("the dry run did not end in its intentional exception");
  }

  it("reports the sessions that lose visibility and the idle live sessions, then rolls back", async () => {
    // Open all-submitted sessions (lose visibility): `lose`, plus the one-person live sessions whose
    // only participant (the owner) submitted: idle1 (old evaluation) and busy (fresh evaluation) = 3.
    // A closed all-submitted session does not count. Idle for 7 days: idle1 and idle2 (never evaluated) = 2.
    const lose = await allSubmittedOpen();
    await allSubmittedOpen({ status: "closed" });
    const o2 = await makeUser({ name: "O2" });
    const idle1 = await makeSession({ ownerId: o2, isGroup: true, samples: [{}] });
    const idle2 = await makeSession({ ownerId: o2, isGroup: true, samples: [{}] });
    const busy = await makeSession({ ownerId: o2, isGroup: true, samples: [{}] });
    const longAgo = new Date(Date.now() - 9 * DAY);
    for (const sess of [idle1, idle2]) await prisma.cuppingSession.update({ where: { id: sess.id }, data: { startedAt: longAgo } });
    await prisma.cuppingSession.update({ where: { id: busy.id }, data: { startedAt: longAgo } });
    await makeEvaluation({ sampleId: busy.samples[0].id, sessionId: busy.id, cupperId: o2, values: 6 }); // updatedAt = now
    const old = await makeEvaluation({ sampleId: idle1.samples[0].id, sessionId: idle1.id, cupperId: o2, values: 6 });
    await prisma.evaluation.update({ where: { id: old.id }, data: { updatedAt: new Date(Date.now() - 8 * DAY) } });
    // Idle MORE than 30 days (closed silently) and exactly 7 days (>= 7 counts, like the code).
    const silent = await makeSession({ ownerId: o2, isGroup: true, samples: [{}] });
    await prisma.cuppingSession.update({ where: { id: silent.id }, data: { startedAt: new Date(Date.now() - 40 * DAY) } });
    const edge = await makeSession({ ownerId: o2, isGroup: true, samples: [{}] });
    await prisma.cuppingSession.update({ where: { id: edge.id }, data: { startedAt: new Date(Date.now() - 7 * DAY - 60_000) } });

    // The test database already carries PHASE 28: put the PHASE 21 function back for the "before" probes.
    await pg.query(oldFunction());
    try {
      // Every session below is treated as started AFTER the rule (effective date 2000-01-01).
      const msg = await runDry("2000-01-01 00:00:00");
      expect(msg).toContain("PHASE 28 DRY RUN: NOTHING WAS APPLIED");
      expect(msg).toMatch(/ 1 open group sessions where everyone submitted[^:]*: 3\n/);
      // names, dates and counts instead of raw ids
      expect(msg).toContain(`"${lose.s.name}", 2026-11-01, 3 participants, 3 submitted`);
      expect(msg).not.toContain(lose.s.id);
      // 7 to 30 days: idle1 (8 d), idle2 (9 d), edge (7 d + 1 min); each has one participant with an email
      expect(msg).toMatch(/ 2a live sessions started on or after the rule \(2000-01-01\), idle 7 days to under 30[^:]*: 3 sessions, 3 participants with an email/);
      expect(msg).toContain(`"${idle2.name}", last activity`);
      // 30 days or more, silently
      expect(msg).toMatch(/ 2b live sessions idle 30 days or more[^:]*: 1 sessions/);
      expect(msg).toContain(`"${silent.name}", last activity`);
      // none of them started before the rule
      expect(msg).toMatch(/ 2c live sessions idle 7 days to under 30, left alone: started before the rule; they close silently only if they reach 30 idle days \(read this number\): 0 sessions/);
      expect(msg).toMatch(/ 3 function installed now[^\n]*after PHASE 28 is applied this line reads 0\): 3\b/);
      expect(msg).toMatch(/4 NEW function, outsider viewer, on the sessions of line 1 \(expect 0\): 0/);
      expect(msg).toMatch(/5a [^:]*\(expect 0\): 0/);
      expect(msg).toMatch(/5b [^:]*\(expect 0\): 0/);
      expect(msg).toMatch(/6 open group sessions checked as their owner \(\d+\) that the owner could NOT view \(expect 0\): 0/);
      expect(msg).toMatch(/7a [^:]*\(expect f f\): f f/);
      expect(msg).toMatch(/7b [^:]*: t\b/);
      expect(msg).toMatch(/7c [^:]*: search_path=public/);
      expect(msg).toMatch(/7d [^:]*\(expect t f\): t f/);
      // The same data with the effective date in the far future: everything started BEFORE the rule.
      // 2a is empty, 2b is unchanged (30 days or more is silent grandfathered or not), 2c lists the three
      // sessions that are left alone and the day each reaches 30 idle days.
      const grand = await runDry("2100-01-01 00:00:00");
      expect(grand).toMatch(/ 2a live sessions started on or after the rule \(2100-01-01\)[^:]*: 0 sessions, 0 participants with an email/);
      expect(grand).toMatch(/ 2b live sessions idle 30 days or more[^:]*: 1 sessions/);
      expect(grand).toMatch(/ 2c [^\n]*\(read this number\): 3 sessions/);
      expect(grand).toContain(`"${idle2.name}", last activity`);
      expect(grand).toMatch(/reaches 30 days on \d{4}-\d{2}-\d{2}/);
      // The real file, with its production literal, also runs to its exception.
      expect(await runDry()).toContain("PHASE 28 DRY RUN: NOTHING WAS APPLIED");
      // rolled back: the OLD function is still the one installed, no temp table survives
      const def = await pg.query("select pg_get_functiondef('public.can_view_group_results(text)'::regprocedure) as d");
      expect(def.rows[0].d).toContain("isDraft");
    } finally {
      await pg.query(newFunction());
    }
    const def = await pg.query("select pg_get_functiondef('public.can_view_group_results(text)'::regprocedure) as d");
    expect(def.rows[0].d).not.toContain("isDraft");
  });
});

describe("closeIdleLiveSessions (Kim C3)", () => {
  async function live(opts: { startedDaysAgo: number | null; isGroup?: boolean; isAsync?: boolean; closesAt?: Date | null }) {
    const owner = await makeUser({ name: "O" });
    const s = await makeSession({ ownerId: owner, isGroup: opts.isGroup ?? true, samples: [{}], closesAt: opts.closesAt ?? null });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: {
        startedAt: opts.startedDaysAgo === null ? null : new Date(NOW - opts.startedDaysAgo * DAY),
        isAsync: opts.isAsync ?? false,
      },
    });
    return { owner, s };
  }

  it("closes only live group sessions idle for 7 days, with reason idle semantics (closed + finalized)", async () => {
    const abandoned = await live({ startedDaysAgo: 8 });
    const recentStart = await live({ startedDaysAgo: 6 });
    const unstarted = await live({ startedDaysAgo: null });
    const solo = await live({ startedDaysAgo: 30, isGroup: false });
    const dated = await live({ startedDaysAgo: 30, closesAt: new Date(NOW + 30 * DAY) });
    const async_ = await live({ startedDaysAgo: 30, isAsync: true });
    const busy = await live({ startedDaysAgo: 30 });
    await evalAt(busy.s.samples[0].id, busy.s.id, busy.owner, NOW); // fresh updatedAt
    const oldEval = await live({ startedDaysAgo: 30 });
    const ev = await makeEvaluation({ sampleId: oldEval.s.samples[0].id, sessionId: oldEval.s.id, cupperId: oldEval.owner, values: 6 });
    await prisma.evaluation.update({ where: { id: ev.id }, data: { updatedAt: new Date(NOW - 8 * DAY) } });

    const r = await closeIdleLiveSessions(25, NOW);
    expect(r.idleClosed).toBe(2);
    expect(r.idleTruncated).toBe(false);
    expect(r.results.map((x) => x.id).sort()).toEqual([abandoned.s.id, oldEval.s.id].sort());

    const status = async (id: string) => (await prisma.cuppingSession.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(abandoned.s.id)).toBe("closed");
    expect(await status(oldEval.s.id)).toBe("closed");
    for (const w of [recentStart, unstarted, solo, dated, async_, busy]) expect(await status(w.s.id)).toBe("active");
    const closed = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: abandoned.s.id } });
    expect(closed.closeFinalizedAt).toBeInstanceOf(Date);
    // group close emails go out through the same routine as the deadline pass
    expect(sendCloseEmails).toHaveBeenCalledWith(abandoned.s.id);
  });

  it("is bounded and oldest first: a full batch reports idleTruncated and leaves the rest for the next run", async () => {
    const a = await live({ startedDaysAgo: 20 });
    const b = await live({ startedDaysAgo: 15 });
    const c = await live({ startedDaysAgo: 10 });
    const first = await closeIdleLiveSessions(2, NOW);
    expect(first.idleTruncated).toBe(true);
    expect(first.results.map((x) => x.id)).toEqual([a.s.id, b.s.id]);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: c.s.id } })).status).toBe("active");
    const second = await closeIdleLiveSessions(2, NOW);
    expect(second.results.map((x) => x.id)).toEqual([c.s.id]);
    expect(second.idleTruncated).toBe(false);
  });

  it("the boundary is exact: 7 days idle closes, one minute less does not", async () => {
    const now = NOW;
    const edge = await live({ startedDaysAgo: 0 });
    await prisma.cuppingSession.update({ where: { id: edge.s.id }, data: { startedAt: new Date(now - LIVE_AUTO_CLOSE_MS + 60_000) } });
    expect((await closeIdleLiveSessions(25, now)).idleClosed).toBe(0);
    expect((await closeIdleLiveSessions(25, now + 120_000)).idleClosed).toBe(1);
  });

  it("a failure on one session is isolated: closeSessionInternal THROWS for one id, the catch path runs, the others still close", async () => {
    const a = await live({ startedDaysAgo: 20 });
    const b = await live({ startedDaysAgo: 15 });
    const c = await live({ startedDaysAgo: 10 });
    hoisted.throwFor = [a.s.id]; // the oldest, so it is processed FIRST
    const r = await closeIdleLiveSessions(25, NOW);
    expect(hoisted.threw).toBe(1);
    const ra = r.results.find((x) => x.id === a.s.id)!;
    expect(ra.closed).toBe(false);
    expect(ra.error).toBe("boom");
    expect(r.idleClosed).toBe(2);
    expect(r.results).toHaveLength(3);
    const status = async (id: string) => (await prisma.cuppingSession.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(a.s.id)).toBe("active"); // the failed one is untouched and retried tomorrow
    expect(await status(b.s.id)).toBe("closed");
    expect(await status(c.s.id)).toBe("closed");
  });

  it("H2: idle 7 to under 30 days closes WITH emails, 30 days or more closes SILENTLY (finalized, no email, no delivery row)", async () => {
    const withEmails = await live({ startedDaysAgo: 29 });
    const silent = await live({ startedDaysAgo: 45 });
    const r = await closeIdleLiveSessions(25, NOW);
    expect(r.idleClosed).toBe(2);
    expect(r.idleClosedSilently).toBe(1);
    expect(r.results.find((x) => x.id === silent.s.id)?.silent).toBe(true);
    expect(r.results.find((x) => x.id === withEmails.s.id)?.silent).toBeUndefined();

    expect(sendCloseEmails).toHaveBeenCalledWith(withEmails.s.id);
    expect(sendCloseEmails).not.toHaveBeenCalledWith(silent.s.id);
    expect(await prisma.closeEmailDelivery.count({ where: { sessionId: silent.s.id } })).toBe(0);

    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: silent.s.id } });
    expect(row.status).toBe("closed");
    expect(row.closeFinalizedAt).toBeInstanceOf(Date); // skip stamps it, so the repair pass never mails later
    const rowWith = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: withEmails.s.id } });
    expect(rowWith.closeFinalizedAt).toBeInstanceOf(Date);
  });

  it("H2 boundary: exactly 30 days idle is silent, one minute less is not", async () => {
    const now = NOW;
    const justUnder = await live({ startedDaysAgo: 0 });
    const exactly = await live({ startedDaysAgo: 0 });
    await prisma.cuppingSession.update({ where: { id: justUnder.s.id }, data: { startedAt: new Date(now - IDLE_SILENT_CLOSE_MS + 60_000) } });
    await prisma.cuppingSession.update({ where: { id: exactly.s.id }, data: { startedAt: new Date(now - IDLE_SILENT_CLOSE_MS) } });
    const r = await closeIdleLiveSessions(25, now);
    expect(r.results.find((x) => x.id === exactly.s.id)?.silent).toBe(true);
    expect(r.results.find((x) => x.id === justUnder.s.id)?.silent).toBeUndefined();
    expect(sendCloseEmails).toHaveBeenCalledWith(justUnder.s.id);
    expect(sendCloseEmails).not.toHaveBeenCalledWith(exactly.s.id);
  });

  it("M1: the time budget stops NEW closes and says so", async () => {
    const a = await live({ startedDaysAgo: 20 });
    const b = await live({ startedDaysAgo: 15 });
    let calls = 0;
    const r = await closeIdleLiveSessions(25, NOW, { mayStart: () => ++calls <= 1 });
    expect(r.idleBudgetTruncated).toBe(true);
    expect(r.idleClosed).toBe(1);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: a.s.id } })).status).toBe("closed");
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: b.s.id } })).status).toBe("active");
  });

  it("race: a session that gets a fresh evaluation after the batch was read is skipped", async () => {
    const a = await live({ startedDaysAgo: 20 });
    const b = await live({ startedDaysAgo: 15 });
    let first = true;
    const r = await closeIdleLiveSessions(25, NOW, {
      // runs right before the re-check of the first candidate (a): someone saves an evaluation
      mayStart: async () => {
        if (first) {
          first = false;
          await evalAt(a.s.samples[0].id, a.s.id, a.owner, NOW);
        }
        return true;
      },
    });
    expect(r.results.map((x) => x.id)).toEqual([b.s.id]);
    expect(r.idleClosed).toBe(1);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: a.s.id } })).status).toBe("active");
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: b.s.id } })).status).toBe("closed");
  });
});


// Second review L2: a candidate that always throws must not block the pass.
describe("closeIdleLiveSessions walks past failing candidates (L2)", () => {
  it("five candidates that always throw, then a healthy one: the healthy one is closed in the same run", async () => {
    const owner = await makeUser({ name: "O" });
    const mk = async (daysAgo: number) => {
      const s = await makeSession({ ownerId: owner, isGroup: true, samples: [{}] });
      await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(NOW - daysAgo * DAY) } });
      return s;
    };
    const bad = [await mk(20), await mk(19), await mk(18), await mk(17), await mk(16)];
    const healthy = await mk(10);
    hoisted.throwFor = bad.map((b) => b.id);
    const r = await closeIdleLiveSessions(5, NOW);
    expect(hoisted.threw).toBe(5);
    expect(r.idleFailed).toBe(5);
    expect(r.examined).toBe(6);
    expect(r.idleClosed).toBe(1);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: healthy.id } })).status).toBe("closed");
    for (const b of bad) expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("active");
  });

  it("stops once `batch` closes SUCCEEDED and reports truncation", async () => {
    const owner = await makeUser({ name: "O" });
    for (const d of [20, 19, 18]) {
      const s = await makeSession({ ownerId: owner, isGroup: true, samples: [{}] });
      await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(NOW - d * DAY) } });
    }
    const r = await closeIdleLiveSessions(2, NOW);
    expect(r.idleClosed).toBe(2);
    expect(r.examined).toBe(2);
    expect(r.idleTruncated).toBe(true);
  });
});

// Second review M-A: a silent idle close whose finalize failed must NOT email the old
// backlog when the cron repair pass runs the next day.
describe("repair pass after a silent idle close (M-A)", () => {
  // The repair owes work only once `Date.now()` is past closedAt + the grace: run on the fixed clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  async function liveIdle(days: number) {
    const owner = await makeUser({ name: "O" });
    const member = await makeUser({ name: "M" });
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [member], samples: [{}] });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(NOW - days * DAY) } });
    return { s, owner };
  }
  /** Moves the close back so the 5-minute repair grace has passed, as the next day's run sees it. */
  async function ageTheClose(id: string, closedDaysAgo: number) {
    await prisma.cuppingSession.update({ where: { id }, data: { closedAt: new Date(NOW - closedDaysAgo * DAY) } });
  }

  it("idle 90 days, history sync throws: closed, not finalized, no ledger row; the repair is silent too", async () => {
    const { s } = await liveIdle(90);
    hoisted.historyThrows = true;
    const r = await closeIdleLiveSessions(5, NOW);
    expect(r.idleClosed).toBe(1);
    expect(r.idleClosedSilently).toBe(1);
    const closed = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(closed.status).toBe("closed");
    expect(closed.closeFinalizedAt).toBeNull();
    expect(await prisma.closeEmailDelivery.count({ where: { sessionId: s.id } })).toBe(0);

    // The next day: the history sync works again; the repair is called exactly as the route calls it.
    hoisted.historyThrows = false;
    await ageTheClose(s.id, 1);
    const rep = await repairClosedSession(s.id);
    expect(rep.repaired).toBe(true);
    expect(rep.finalized).toBe(true);
    expect(sendCloseEmails).not.toHaveBeenCalled();
    expect(await prisma.closeEmailDelivery.count({ where: { sessionId: s.id } })).toBe(0);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } })).closeFinalizedAt).toBeInstanceOf(Date);
  });

  it("an evaluation touched AFTER the close does not make the session look recently active", async () => {
    const { s, owner } = await liveIdle(90);
    hoisted.historyThrows = true;
    await closeIdleLiveSessions(5, NOW);
    hoisted.historyThrows = false;
    await ageTheClose(s.id, 1);
    // updatedAt = now, which is after closedAt (what the aggregate re-fire of a finalize does)
    await evalAt(s.samples[0].id, s.id, owner, NOW);
    await repairClosedSession(s.id);
    expect(sendCloseEmails).not.toHaveBeenCalled();
  });

  it("counter-case: a deadline (async) session whose finalize failed is repaired WITH emails, as today", async () => {
    const owner = await makeUser({ name: "O" });
    const member = await makeUser({ name: "M" });
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [member], samples: [{}], closesAt: new Date(NOW - 90 * DAY) });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { isAsync: true, startedAt: new Date(NOW - 100 * DAY) } });
    hoisted.historyThrows = true;
    const first = await closeSessionInternal(s.id, { reason: "cron", emails: "await" });
    expect(first.closed).toBe(true);
    expect(first.finalized).toBe(false);
    hoisted.historyThrows = false;
    await ageTheClose(s.id, 1);
    sendCloseEmails.mockClear();
    const rep = await repairClosedSession(s.id);
    expect(rep.finalized).toBe(true);
    expect(sendCloseEmails).toHaveBeenCalledWith(s.id);
  });

  it("a live session idle 10 days (emails by design) is repaired WITH emails", async () => {
    const { s } = await liveIdle(10);
    hoisted.historyThrows = true;
    await closeIdleLiveSessions(5, NOW);
    hoisted.historyThrows = false;
    await ageTheClose(s.id, 1);
    sendCloseEmails.mockClear();
    await repairClosedSession(s.id);
    expect(sendCloseEmails).toHaveBeenCalledWith(s.id);
  });
});

// ─── Third round: the owner's grandfather rule ──────────────────────────────────────────────
// A session STARTED before IDLE_RULE_EFFECTIVE_AT is never closed with emails; it closes silently
// at 30 idle days, and it gets no new 24 h reminder. TODO(kim-validar:C3)
describe("grandfathered sessions (started before the idle rule)", () => {
  // The repair owes work only once `Date.now()` is past closedAt + the grace: run on the pass clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(EFF + 10 * DAY);
  });
  afterEach(() => vi.useRealTimers());
  // The pass runs ten days after the rule shipped.
  const PASS_AT = EFF + 10 * DAY;
  async function liveAt(startedAt: number) {
    const owner = await makeUser({ name: "O" });
    const member = await makeUser({ name: "M" });
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [member], samples: [{}] });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(startedAt) } });
    return { s, owner, member };
  }
  const statusOf = async (id: string) => (await prisma.cuppingSession.findUniqueOrThrow({ where: { id } })).status;

  it("a grandfathered session idle 10 days is NOT a candidate (not even fetched) and is not closed", async () => {
    // started 0.0 d before the rule is still grandfathered: 1 ms before it, idle 10 d at PASS_AT
    const g = await liveAt(EFF - 1);
    const r = await closeIdleLiveSessions(25, PASS_AT);
    expect(r.examined).toBe(0); // the candidate query never returned it
    expect(r.idleClosed).toBe(0);
    expect(r.results).toEqual([]);
    expect(await statusOf(g.s.id)).toBe("active");
    expect(sendCloseEmails).not.toHaveBeenCalled();
  });

  it("a grandfathered session idle 31 days is closed SILENTLY, and its repair is silent too", async () => {
    const started = PASS_AT - 31 * DAY;
    expect(started).toBeLessThan(EFF); // started 2026-11-17: before the rule
    const g = await liveAt(started);
    hoisted.historyThrows = true; // finalize fails halfway: closed, not finalized
    const r = await closeIdleLiveSessions(25, PASS_AT);
    expect(r.idleClosed).toBe(1);
    expect(r.idleClosedSilently).toBe(1);
    expect(r.results[0].silent).toBe(true);
    expect(sendCloseEmails).not.toHaveBeenCalled();
    const closed = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: g.s.id } });
    expect(closed.status).toBe("closed");
    expect(closed.closeFinalizedAt).toBeNull();
    expect(await prisma.closeEmailDelivery.count({ where: { sessionId: g.s.id } })).toBe(0);

    hoisted.historyThrows = false;
    await prisma.cuppingSession.update({ where: { id: g.s.id }, data: { closedAt: new Date(PASS_AT - DAY) } });
    const rep = await repairClosedSession(g.s.id);
    expect(rep.finalized).toBe(true);
    expect(sendCloseEmails).not.toHaveBeenCalled();
  });

  it("a grandfathered session idle exactly 30 days is silent, one minute less is left alone", async () => {
    // started 2026-11-08 12:00-ish, well before the rule
    const at = EFF - 5 * DAY + IDLE_SILENT_CLOSE_MS;
    const exactly = await liveAt(at - IDLE_SILENT_CLOSE_MS);
    const justUnder = await liveAt(at - IDLE_SILENT_CLOSE_MS + 60_000);
    const r = await closeIdleLiveSessions(25, at);
    expect(r.results.map((x) => x.id)).toEqual([exactly.s.id]);
    expect(r.results[0].silent).toBe(true);
    expect(await statusOf(justUnder.s.id)).toBe("active");
  });

  it("a session started after the rule and idle 9 days is closed WITH emails, and its repair has emails", async () => {
    const n = await liveAt(EFF + DAY); // idle 9 d at PASS_AT
    hoisted.historyThrows = true;
    const r = await closeIdleLiveSessions(25, PASS_AT);
    expect(r.idleClosed).toBe(1);
    expect(r.idleClosedSilently).toBe(0);
    expect(r.results[0].silent).toBeUndefined();
    sendCloseEmails.mockClear(); // the idle close itself mails; what is checked below is the repair
    hoisted.historyThrows = false;
    await prisma.cuppingSession.update({ where: { id: n.s.id }, data: { closedAt: new Date(PASS_AT - DAY) } });
    await repairClosedSession(n.s.id);
    expect(sendCloseEmails).toHaveBeenCalledWith(n.s.id);
  });

  it("a session that started exactly at the effective instant follows the new rule (7 days = emails)", async () => {
    const at = await liveAt(EFF);
    const r = await closeIdleLiveSessions(25, EFF + 7 * DAY);
    expect(r.results.map((x) => x.id)).toEqual([at.s.id]);
    expect(r.results[0].silent).toBeUndefined();
    expect(sendCloseEmails).toHaveBeenCalledWith(at.s.id);
  });

  it("a session started after the rule and idle 31 days is closed silently", async () => {
    const n = await liveAt(EFF + DAY);
    const r = await closeIdleLiveSessions(25, EFF + DAY + 31 * DAY);
    expect(r.idleClosedSilently).toBe(1);
    expect(sendCloseEmails).not.toHaveBeenCalled();
    expect(await statusOf(n.s.id)).toBe("closed");
  });

  it("the walk is not filled by grandfathered sessions that are left alone", async () => {
    // Six grandfathered sessions (older start, idle 15 days) sit ahead of one new session idle 8 days.
    for (let i = 0; i < 6; i++) await liveAt(EFF - 5 * DAY - i * 60_000);
    const fresh = await liveAt(EFF + 2 * DAY);
    const r = await closeIdleLiveSessions(1, EFF + 10 * DAY);
    expect(r.results.map((x) => x.id)).toEqual([fresh.s.id]);
    expect(r.examined).toBe(1);
  });
});

describe("live_idle reminder and the grandfather rule", () => {
  it("no reminder for a grandfathered session; a new one idle between 24 h and 7 days gets exactly one", async () => {
    const at = EFF + 3 * DAY;
    const mk = async (startedAt: number) => {
      const owner = await makeUser({ name: "O" });
      const s = await makeSession({ ownerId: owner, isGroup: true, samples: [{}] });
      await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(startedAt) } });
      return s;
    };
    const grandfathered = await mk(EFF - 2 * DAY); // idle 5 d
    const fresh = await mk(EFF); // idle 3 d
    const r = await sendLiveIdleReminders(25, at);
    expect(r.sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.sessionReminderDelivery.count({ where: { sessionId: grandfathered.id } })).toBe(0);
    expect(await prisma.sessionReminderDelivery.count({ where: { sessionId: fresh.id, kind: "live_idle" } })).toBe(1);
    // and a second run sends nothing more (the ledger is once per session)
    sendEmail.mockClear();
    expect((await sendLiveIdleReminders(25, at)).sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ─── Review lows L2 and L3 ──────────────────────────────────────────────────────────────────
describe("repair pass: the ledger count and the deleted creator (L2, L3)", () => {
  // The repair owes work only once `Date.now()` is past closedAt + the grace: run on the fixed clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());
  it("L2: a 90-day silent close that ALREADY has a close_email_deliveries row is repaired WITH emails", async () => {
    const owner = await makeUser({ name: "O" });
    const member = await makeUser({ name: "M" });
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [member], samples: [{}] });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { startedAt: new Date(NOW - 90 * DAY) } });
    hoisted.historyThrows = true;
    expect((await closeIdleLiveSessions(5, NOW)).idleClosedSilently).toBe(1);
    hoisted.historyThrows = false;
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closedAt: new Date(NOW - DAY) } });

    // Somebody already started emailing it (a failed "Reenviar"): one ledger row
    await prisma.closeEmailDelivery.create({ data: { sessionId: s.id, userId: member, status: "failed" } });
    await repairClosedSession(s.id);
    expect(sendCloseEmails).toHaveBeenCalledWith(s.id);
  });

  it("L3: a session whose creator is a deleted-account placeholder is repaired WITHOUT emails, a normal owner's WITH", async () => {
    const mk = async (deleted: boolean) => {
      const owner = await makeUser({ name: "O" });
      const member = await makeUser({ name: "M" });
      const s = await makeSession({
        ownerId: owner,
        isGroup: true,
        participants: [member],
        samples: [{}],
        closesAt: new Date(NOW - 90 * DAY),
      });
      await prisma.cuppingSession.update({ where: { id: s.id }, data: { isAsync: true, startedAt: new Date(NOW - 100 * DAY) } });
      hoisted.historyThrows = true;
      const first = await closeSessionInternal(s.id, { reason: "cron", emails: "await" });
      expect(first.finalized).toBe(false);
      hoisted.historyThrows = false;
      if (deleted) {
        // what account deletion leaves behind: a `deleted_<random>` profile the session now points at
        const ph = `deleted_${s.id.slice(0, 8)}`;
        await prisma.profile.create({ data: { id: ph, displayName: "Cuenta eliminada" } });
        await prisma.cuppingSession.update({ where: { id: s.id }, data: { createdBy: ph } });
      }
      await prisma.cuppingSession.update({ where: { id: s.id }, data: { closedAt: new Date(NOW - DAY) } });
      return s;
    };
    const gone = await mk(true);
    sendCloseEmails.mockClear();
    const rep = await repairClosedSession(gone.id);
    expect(rep.finalized).toBe(true);
    expect(sendCloseEmails).not.toHaveBeenCalled();

    const normal = await mk(false);
    sendCloseEmails.mockClear();
    await repairClosedSession(normal.id);
    expect(sendCloseEmails).toHaveBeenCalledWith(normal.id);
  });
});
