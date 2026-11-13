// Group 8: RLS / privilege smoke test as the API role `authenticated` (and `anon`).
// SET LOCAL ROLE + request.jwt.claims, exactly what PostgREST does per request.
import type { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, rawClient, resetDb } from "./support/db";

let pg: Client;
beforeAll(async () => {
  pg = await rawClient();
});
afterAll(async () => {
  await pg.end();
});
beforeEach(resetDb);

async function asRole<T>(role: "authenticated" | "anon", uid: string | null, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  await pg.query("BEGIN");
  try {
    await pg.query(`SET LOCAL ROLE ${role}`);
    await pg.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(uid ? { sub: uid, role } : { role }),
    ]);
    return await fn(pg.query.bind(pg));
  } finally {
    await pg.query("ROLLBACK");
  }
}
const asUser = <T>(uid: string, fn: (q: Client["query"]) => Promise<T>) => asRole("authenticated", uid, fn);

async function world() {
  const owner = await makeUser({ name: "Owner" });
  const a = await makeUser({ name: "A" });
  const b = await makeUser({ name: "B" });
  const outsider = await makeUser({ name: "Outsider" });
  const priv = await makeCoffee(owner, "privado");
  const shared = await makeCoffee(owner, "compartido");
  const pub = await makeCoffee(owner, "publico");
  await prisma.coffee.update({ where: { id: shared.id }, data: { visibility: "shared" } });
  await prisma.coffee.update({ where: { id: pub.id }, data: { visibility: "public" } });
  await prisma.coffeeShare.create({ data: { coffeeId: shared.id, userId: a } });
  const s = await makeSession({ ownerId: owner, isGroup: true, participants: [a, b], samples: [{ coffeeId: priv.id }] });
  const evA = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: a, values: 7 });
  const evB = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: b, values: 5 });
  return { owner, a, b, outsider, priv, shared, pub, s, evA, evB };
}

describe("RLS as authenticated", () => {
  it("a participant reads their own evaluation and never another cupper's", async () => {
    const w = await world();
    const mine = await asUser(w.a, (q) => q('select id, "cupperId" from evaluations'));
    expect(mine.rows.map((r) => r.id)).toEqual([w.evA.id]);
    const theirs = await asUser(w.b, (q) => q('select id from evaluations where id = $1', [w.evA.id]));
    expect(theirs.rows).toHaveLength(0);
    const outsider = await asUser(w.outsider, (q) => q("select id from evaluations"));
    expect(outsider.rows).toHaveLength(0);
  });

  it("the session owner reads SUBMITTED evaluations of the session, not drafts", async () => {
    const w = await world();
    const sess = await makeSession({ ownerId: w.owner, isGroup: true, participants: [w.a], samples: [{}] });
    const draft = await makeEvaluation({ sampleId: sess.samples[0].id, sessionId: sess.id, cupperId: w.a, values: 2, draft: true });
    const rows = await asUser(w.owner, (q) => q("select id from evaluations"));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([w.evA.id, w.evB.id]));
    expect(ids).not.toContain(draft.id);
  });

  it("INSERT, UPDATE and DELETE on evaluations are refused (privilege, not just RLS)", async () => {
    const w = await world();
    const sample = w.s.samples[0].id;
    await expect(
      asUser(w.a, (q) =>
        q(`insert into evaluations (id, "sessionSampleId", "cupperId", "updatedAt") values ('forged', $1, $2, now())`, [sample, w.a]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      asUser(w.a, (q) => q(`update evaluations set "isDraft" = true where id = $1`, [w.evA.id])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(w.a, (q) => q(`delete from evaluations where id = $1`, [w.evA.id]))).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(w.a, (q) => q(`truncate evaluations`))).rejects.toMatchObject({ code: "42501" });
    // and nothing changed
    expect(await prisma.evaluation.count()).toBeGreaterThanOrEqual(2);
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: w.evA.id } })).isDraft).toBe(false);
  });

  it("no API role has a write privilege anywhere in public", async () => {
    const r = await pg.query(`
      select c.relname, r.role, p.priv
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      cross join unnest(array['anon','authenticated']) as r(role)
      cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as p(priv)
      where c.relkind in ('r','p') and has_table_privilege(r.role::name, c.oid, p.priv)`);
    expect(r.rows).toEqual([]);
  });

  it("session_participants: the four exclusion columns are hidden (PHASE 25), the rest readable", async () => {
    const w = await world();
    for (const col of ["excluded_from_results", "excluded_at", "excluded_by", "exclusion_reason"]) {
      await expect(asUser(w.a, (q) => q(`select ${col} from session_participants`))).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asUser(w.a, (q) => q("select * from session_participants"))).rejects.toMatchObject({ code: "42501" });
    const ok = await asUser(w.a, (q) => q('select "sessionId", "userId", status, "joinedAt" from session_participants'));
    expect(ok.rows.length).toBeGreaterThanOrEqual(3); // owner, a, b of the session they belong to
    expect(ok.rows.every((r) => r.sessionId === w.s.id)).toBe(true);
    // an outsider sees none
    expect((await asUser(w.outsider, (q) => q('select "userId" from session_participants'))).rows).toHaveLength(0);
  });

  it("session_samples.coffeeId is hidden from the API (PHASE 21)", async () => {
    const w = await world();
    await expect(asUser(w.a, (q) => q('select "coffeeId" from session_samples'))).rejects.toMatchObject({ code: "42501" });
    const ok = await asUser(w.a, (q) => q("select id, label from session_samples"));
    expect(ok.rows).toHaveLength(1);
  });

  // S10 WP2 / A9: per-sample preparation data can identify a coffee, so the four
  // columns are owner-only until reveal and never granted to the browser key.
  it("session_samples roastDate / preparationNote / offProtocol / offProtocolNote are hidden from the API", async () => {
    const w = await world();
    for (const col of ['"roastDate"', '"preparationNote"', '"offProtocol"', '"offProtocolNote"']) {
      await expect(asUser(w.a, (q) => q(`select ${col} from session_samples`))).rejects.toMatchObject({ code: "42501" });
    }
    // the granted columns still read
    const ok = await asUser(w.a, (q) => q('select id, label, "referenceRank" from session_samples'));
    expect(ok.rows).toHaveLength(1);
  });

  it("coffees and coffee_shares select without a policy recursion (PHASE 24, 42P17)", async () => {
    const w = await world();
    const coffees = await asUser(w.a, (q) => q("select name from coffees order by name"));
    expect(coffees.rows.map((r) => r.name)).toEqual(["compartido", "publico"]); // shared-with-me + public, not private
    const shares = await asUser(w.a, (q) => q('select "coffeeId", "userId" from coffee_shares'));
    expect(shares.rows).toEqual([{ coffeeId: w.shared.id, userId: w.a }]);
    // the owner sees every share of their coffees and all three coffees
    expect((await asUser(w.owner, (q) => q("select count(*)::int as n from coffees"))).rows[0].n).toBe(3);
    expect((await asUser(w.owner, (q) => q("select count(*)::int as n from coffee_shares"))).rows[0].n).toBe(1);
    // someone with no relationship sees only the public one and no shares
    expect((await asUser(w.outsider, (q) => q("select name from coffees"))).rows.map((r) => r.name)).toEqual(["publico"]);
    expect((await asUser(w.outsider, (q) => q("select * from coffee_shares"))).rows).toHaveLength(0);
  });

  it("warmup_reflections is private: neither API role can read or write it, with or without a matching user (PHASE 27)", async () => {
    const w = await world();
    const mine = await prisma.warmupReflection.create({ data: { userId: w.a, exerciseId: "eyes", feel: "solo para mí" } });
    for (const who of [w.a, w.b, w.owner, w.outsider]) {
      await expect(asUser(who, (q) => q("select * from warmup_reflections"))).rejects.toMatchObject({ code: "42501" });
      await expect(asUser(who, (q) => q('select id from warmup_reflections where "userId" = $1', [who]))).rejects.toMatchObject({ code: "42501" });
      await expect(
        asUser(who, (q) => q('insert into warmup_reflections (id, "userId", "exerciseId", feel) values ($1, $2, $3, $4)', ["x", who, "eyes", "y"])),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(asUser(who, (q) => q("delete from warmup_reflections"))).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asRole("anon", null, (q) => q("select * from warmup_reflections"))).rejects.toMatchObject({ code: "42501" });
    // the app (Prisma, as the table owner) still sees the row, untouched
    expect((await prisma.warmupReflection.findUniqueOrThrow({ where: { id: mine.id } })).feel).toBe("solo para mí");
    // RLS is on with no policy at all
    const meta = await pg.query(`select c.relrowsecurity as rls, (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = 'warmup_reflections') as policies from pg_class c where c.oid = 'public.warmup_reflections'::regclass`);
    expect(meta.rows[0]).toEqual({ rls: true, policies: 0 });
  });

  it("anon sees nothing of the app tables", async () => {
    const w = await world();
    void w;
    for (const t of ["evaluations", "coffees", "cupping_sessions", "session_participants", "profiles", "aggregate_scores", "user_coffee_history"]) {
      let n = 0;
      try {
        n = (await asRole("anon", null, (q) => q(`select count(*)::int as n from ${t}`))).rows[0].n;
      } catch (e) {
        expect((e as { code?: string }).code).toBe("42501");
      }
      expect(n, t).toBe(0);
    }
  });

  it("the aggregate trigger still works while the browser roles are read-only (SECURITY DEFINER)", async () => {
    const w = await world();
    const agg = await prisma.aggregateScore.findUnique({ where: { sessionSampleId: w.s.samples[0].id } });
    expect(agg?.participantCount).toBe(2);
  });
});
