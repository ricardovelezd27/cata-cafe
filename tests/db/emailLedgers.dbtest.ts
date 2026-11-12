// Group 7: the email ledgers against Postgres.
//  - lib/emailBudget.ts reserveEmailBudget (outbound_email_events)
//  - lib/closeEmail.ts sendCloseEmails claim/lease (close_email_deliveries)
// Mocked boundaries only: the Resend sender, the Supabase admin client and PDF rendering.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getUserById: vi.fn(),
}));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: (...a: unknown[]) => h.sendEmail(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: (...a: unknown[]) => h.getUserById(...a) } } }),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: async () => Buffer.from("%PDF-stub") }));
vi.mock("@/lib/pdf/ParticipantSummaryDocument", () => ({ ParticipantSummaryDocument: () => ({}) }));
vi.mock("@/lib/pdf/CvaFormDocument", () => ({ CvaFormDocument: () => ({}) }));
vi.mock("@/lib/reports/sessionReportData", () => ({ loadSessionReportSource: async () => ({ stub: true }) }));
vi.mock("@/lib/reports/participantSummary", () => ({ buildParticipantSummary: () => ({}) }));

import { reserveEmailBudget } from "@/lib/emailBudget";
import { sendCloseEmails } from "@/lib/closeEmail";
import { makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

process.env.GUEST_CLAIM_SECRET = "test-secret-for-the-db-suite";

beforeEach(async () => {
  await resetDb();
  h.sendEmail.mockReset();
  h.getUserById.mockReset();
  h.sendEmail.mockImplementation(async () => {
    await sleep(40);
    return { ok: true };
  });
  h.getUserById.mockImplementation(async (id: string) => {
    await sleep(20);
    return { data: { user: { id, email: `${id.slice(0, 8)}@example.test` } }, error: null };
  });
});

describe("reserveEmailBudget", () => {
  it("magic link: the 4th request for one address in 15 min is refused, and only 3 rows exist", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await reserveEmailBudget({ kind: "magic_link", ip: "203.0.113.9", email: "Ana@Example.test" }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    const refused = results[3];
    expect(refused.allowed === false && refused.retryAfterMs > 0).toBe(true);
    expect(await prisma.outboundEmailEvent.count({ where: { kind: "magic_link" } })).toBe(3);
    // another address from the same IP is a different bucket
    expect((await reserveEmailBudget({ kind: "magic_link", ip: "203.0.113.9", email: "otra@example.test" })).allowed).toBe(true);
    // the ledger holds HMACs, never the address or the IP
    const rows = await prisma.outboundEmailEvent.findMany();
    expect(JSON.stringify(rows)).not.toMatch(/example\.test|203\.0\.113/);
  });

  it("group broadcast: 3 per hour per account; recipients capped for a new account", async () => {
    const u = await makeUser();
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await reserveEmailBudget({ kind: "group_broadcast", userId: u, recipients: 2 })).allowed);
    expect(r).toEqual([true, true, true, false]);

    const v = await makeUser();
    expect((await reserveEmailBudget({ kind: "group_invite", userId: v, recipients: 40 })).allowed).toBe(true); // new account cap = 40/day
    expect((await reserveEmailBudget({ kind: "group_invite", userId: v, recipients: 1 })).allowed).toBe(false);
    expect(await prisma.outboundEmailEvent.count({ where: { actorKey: `u_${v}` } })).toBe(1);
  });

  it("close_resend: 3 per session per hour", async () => {
    const out = [];
    for (let i = 0; i < 4; i++) out.push((await reserveEmailBudget({ kind: "close_resend", sessionId: "sess1" })).allowed);
    expect(out).toEqual([true, true, true, false]);
    expect((await reserveEmailBudget({ kind: "close_resend", sessionId: "sess2" })).allowed).toBe(true);
  });

  it("events older than the window stop counting", async () => {
    for (let i = 0; i < 3; i++) await reserveEmailBudget({ kind: "magic_link", ip: null, email: "a@example.test" });
    expect((await reserveEmailBudget({ kind: "magic_link", ip: null, email: "a@example.test" })).allowed).toBe(false);
    await prisma.$executeRaw`update outbound_email_events set "createdAt" = now() - interval '16 minutes'`;
    expect((await reserveEmailBudget({ kind: "magic_link", ip: null, email: "a@example.test" })).allowed).toBe(true);
  });

  // The module documents "two simultaneous requests can overshoot by one". The real
  // behaviour under N simultaneous requests is measured here and pinned to the
  // documented guarantee, which is what a reader of the comment relies on.
  // DEFECT (D-05 finding, low): lib/emailBudget.ts says check-then-insert "can overshoot a
  // limit by one reservation". Under 10 simultaneous requests 6 pass a limit of 3 (measured),
  // so the stated bound does not hold. Marked it.fails so the suite goes red the day it is fixed.
  it.fails("N simultaneous requests overshoot the limit by at most one (documented guarantee)", async () => {
    const N = 10;
    const res = await Promise.all(
      Array.from({ length: N }, () => reserveEmailBudget({ kind: "magic_link", ip: null, email: "race@example.test" })),
    );
    const allowed = res.filter((r) => r.allowed).length;
    console.log(`[D-05] ${N} simultaneous magic_link reservations, limit 3 -> ${allowed} allowed`);
    expect(allowed).toBeLessThanOrEqual(3 + 1);
  });
});

async function closedGroup(n = 3) {
  const owner = await makeUser();
  const users = await Promise.all(Array.from({ length: n }, () => makeUser()));
  const s = await makeSession({ ownerId: owner, isGroup: true, participants: users, samples: [{}], status: "closed" });
  for (const u of [owner, ...users]) {
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: u, values: 6 });
  }
  return { owner, users, s, all: [owner, ...users] };
}

describe("sendCloseEmails ledger", () => {
  it("sends once per participant and records 'sent'", async () => {
    const { s, all } = await closedGroup();
    const sum = await sendCloseEmails(s.id);
    expect(sum).toEqual({ attempted: all.length, sent: all.length, skipped: 0, failed: 0 });
    expect(h.sendEmail).toHaveBeenCalledTimes(all.length);
    const rows = await prisma.closeEmailDelivery.findMany({ where: { sessionId: s.id } });
    expect(rows.map((r) => r.status)).toEqual(Array(all.length).fill("sent"));
    // a re-run is a no-op
    const again = await sendCloseEmails(s.id);
    expect(again.attempted).toBe(0);
    expect(h.sendEmail).toHaveBeenCalledTimes(all.length);
  });

  it("two concurrent runs: every recipient is emailed exactly once", async () => {
    const { s, all } = await closedGroup(5);
    const [a, b] = await Promise.all([sendCloseEmails(s.id), sendCloseEmails(s.id)]);
    expect(h.sendEmail).toHaveBeenCalledTimes(all.length);
    const recipients = h.sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(new Set(recipients).size).toBe(all.length);
    expect(a.sent + b.sent).toBe(all.length);
    // the loser reports 'held' recipients as not attempted
    expect(a.attempted + b.attempted).toBe(all.length);
    const rows = await prisma.closeEmailDelivery.findMany({ where: { sessionId: s.id } });
    expect(rows).toHaveLength(all.length);
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });

  it("a fresh 'sending' lease is respected; one older than the lease is reclaimed", async () => {
    const { s, users, owner } = await closedGroup(2);
    const [fresh, stale] = users;
    await prisma.closeEmailDelivery.createMany({
      data: [
        { sessionId: s.id, userId: fresh, status: "sending" },
        { sessionId: s.id, userId: stale, status: "sending" },
      ],
    });
    await prisma.$executeRaw`
      update close_email_deliveries set "updatedAt" = now() - interval '11 minutes'
      where "sessionId" = ${s.id} and "userId" = ${stale}`;

    const sum = await sendCloseEmails(s.id);
    const sentTo = new Set(h.sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to));
    expect(sentTo.has(`${stale.slice(0, 8)}@example.test`)).toBe(true);
    expect(sentTo.has(`${fresh.slice(0, 8)}@example.test`)).toBe(false);
    expect(sentTo.has(`${owner.slice(0, 8)}@example.test`)).toBe(true);
    expect(sum.sent).toBe(2); // owner + stale

    const rows = new Map((await prisma.closeEmailDelivery.findMany({ where: { sessionId: s.id } })).map((r) => [r.userId, r]));
    expect(rows.get(fresh)?.status).toBe("sending");
    expect(rows.get(stale)?.status).toBe("sent");
    expect(rows.get(stale)?.attempts).toBe(2);
  });

  it("failed and skipped rows are retried; sent rows never", async () => {
    const { s, users } = await closedGroup(2);
    await prisma.closeEmailDelivery.createMany({
      data: [
        { sessionId: s.id, userId: users[0], status: "failed", lastError: "timeout" },
        { sessionId: s.id, userId: users[1], status: "sent" },
      ],
    });
    const sum = await sendCloseEmails(s.id);
    expect(sum.sent).toBe(2); // owner (no row) + the failed one
    const sentTo = h.sendEmail.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(sentTo).not.toContain(`${users[1].slice(0, 8)}@example.test`);
    expect((await prisma.closeEmailDelivery.findUniqueOrThrow({ where: { sessionId_userId: { sessionId: s.id, userId: users[0] } } })).status).toBe("sent");
  });

  it("a send that fails is recorded as failed (not left 'sending')", async () => {
    const { s, all } = await closedGroup(1);
    h.sendEmail.mockResolvedValue({ ok: false, error: "resend 500" });
    const sum = await sendCloseEmails(s.id);
    expect(sum.failed).toBe(all.length);
    const rows = await prisma.closeEmailDelivery.findMany({ where: { sessionId: s.id } });
    expect(rows.every((r) => r.status === "failed" && r.lastError === "resend 500")).toBe(true);
  });
});
