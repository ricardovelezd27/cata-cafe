// S10 WP4a (Kim C3, C5): the real RLS function, the PHASE 28 dry run and the idle-close pass,
// against the throwaway local Postgres. The email sender is the only mocked boundary.
// TODO(kim-validar:C3) TODO(kim-validar:C5)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendCloseEmails = vi.fn();
vi.mock("@/lib/closeEmail", () => ({ sendCloseEmails: (...a: unknown[]) => sendCloseEmails(...a) }));

import { closeIdleLiveSessions } from "@/lib/idleClose";
import { LIVE_AUTO_CLOSE_MS } from "@/lib/closeRules";
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
  sendCloseEmails.mockReset();
  sendCloseEmails.mockResolvedValue({ attempted: 0, sent: 0, skipped: 0, failed: 0 });
});

const DAY = 24 * 3_600_000;

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

  async function runDry(): Promise<string> {
    const dry = readFileSync(dryPath, "utf8");
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

    // The test database already carries PHASE 28: put the PHASE 21 function back for the "before" probes.
    await pg.query(oldFunction());
    try {
      const msg = await runDry();
      expect(msg).toContain("PHASE 28 DRY RUN: NOTHING WAS APPLIED");
      expect(msg).toMatch(/1 open group sessions where everyone submitted[^:]*: 3 \(first ids: /);
      expect(msg).toContain(lose.s.id);
      expect(msg).toMatch(/2 live sessions idle for more than 7 days[^:]*: 2 \(oldest ids: /);
      expect(msg).toMatch(/3 OLD function, outsider viewer[^:]*: 3\b/);
      expect(msg).toMatch(/4 NEW function, outsider viewer, on the sessions of line 1 \(expect 0\): 0/);
      expect(msg).toMatch(/5a [^:]*\(expect 0\): 0/);
      expect(msg).toMatch(/5b [^:]*\(expect 0\): 0/);
      expect(msg).toMatch(/6 open group sessions checked as their owner \(\d+\) that the owner could NOT view \(expect 0\): 0/);
      expect(msg).toMatch(/7a [^:]*\(expect f f\): f f/);
      expect(msg).toMatch(/7b [^:]*: t\b/);
      expect(msg).toMatch(/7c [^:]*: search_path=public/);
      expect(msg).toMatch(/7d [^:]*\(expect t f\): t f/);
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
        startedAt: opts.startedDaysAgo === null ? null : new Date(Date.now() - opts.startedDaysAgo * DAY),
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
    const dated = await live({ startedDaysAgo: 30, closesAt: new Date(Date.now() + 30 * DAY) });
    const async_ = await live({ startedDaysAgo: 30, isAsync: true });
    const busy = await live({ startedDaysAgo: 30 });
    await makeEvaluation({ sampleId: busy.s.samples[0].id, sessionId: busy.s.id, cupperId: busy.owner, values: 6 }); // fresh updatedAt
    const oldEval = await live({ startedDaysAgo: 30 });
    const ev = await makeEvaluation({ sampleId: oldEval.s.samples[0].id, sessionId: oldEval.s.id, cupperId: oldEval.owner, values: 6 });
    await prisma.evaluation.update({ where: { id: ev.id }, data: { updatedAt: new Date(Date.now() - 8 * DAY) } });

    const r = await closeIdleLiveSessions(25);
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
    const first = await closeIdleLiveSessions(2);
    expect(first.idleTruncated).toBe(true);
    expect(first.results.map((x) => x.id)).toEqual([a.s.id, b.s.id]);
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: c.s.id } })).status).toBe("active");
    const second = await closeIdleLiveSessions(2);
    expect(second.results.map((x) => x.id)).toEqual([c.s.id]);
    expect(second.idleTruncated).toBe(false);
  });

  it("the boundary is exact: 7 days idle closes, one minute less does not", async () => {
    const now = Date.now();
    const edge = await live({ startedDaysAgo: 0 });
    await prisma.cuppingSession.update({ where: { id: edge.s.id }, data: { startedAt: new Date(now - LIVE_AUTO_CLOSE_MS + 60_000) } });
    expect((await closeIdleLiveSessions(25, now)).idleClosed).toBe(0);
    expect((await closeIdleLiveSessions(25, now + 120_000)).idleClosed).toBe(1);
  });

  it("a failure on one session is isolated: the others still close", async () => {
    const a = await live({ startedDaysAgo: 20 });
    const b = await live({ startedDaysAgo: 15 });
    sendCloseEmails.mockImplementation(async (id: string) => {
      if (id === a.s.id) throw new Error("smtp down");
      return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
    });
    const r = await closeIdleLiveSessions(25);
    // phase 1 (the flip) commits before phase 2; either way b is closed and the run did not throw
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: b.s.id } })).status).toBe("closed");
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: a.s.id } })).status).toBe("closed");
    expect(r.results).toHaveLength(2);
  });
});
