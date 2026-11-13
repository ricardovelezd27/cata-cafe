// The 12-month deletion of accounts that were never used (S10 WP9a), against a
// real database. Only the Supabase admin API is mocked (deleteUser removes the
// auth row like the real one; listUsers feeds the strict-listing test).
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteUser = vi.fn();
const listUsers = vi.fn();
const updateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser, listUsers, updateUserById } } }),
}));

import { purgeUnusedAccounts, selectAuthEligibleIds } from "@/lib/unusedAccountPurge";
import {
  UNUSED_ACCOUNT_BATCH,
  UNUSED_ACCOUNT_RULES,
  notUnusedReason,
  recentAccessEmailThreshold,
  type AuthUserFacts,
} from "@/lib/unusedAccountRules";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";
import { WAITLIST_RETENTION_MONTHS } from "@/lib/legal/config";
import { moveWaitlistEntry } from "@/lib/waitlistMove";
import { moveReservationAfterEmailChange, recordEmailChange } from "@/lib/emailChangeMove";
import { getCoCupperCandidates } from "@/lib/coCuppers";
import { listAllAuthUsersStrict } from "@/lib/supabase/adminUsers";
import { PROFILE_MANIFEST, manifestKey } from "@/lib/accountDeletion/manifest";
import { makeCoffee, makeEvaluation, makeSession, makeUser, prisma, resetDb } from "./support/db";

const BOSS = "boss@example.test"; // ANALYTICS_SUPER_ADMIN_EMAIL for this file
const NOW = new Date("2026-11-13T06:00:00.000Z");
const CUTOFF = waitlistPurgeCutoff(NOW, WAITLIST_RETENTION_MONTHS);
const THRESHOLD = recentAccessEmailThreshold(NOW);
const OLD = waitlistPurgeCutoff(NOW, 13); // 13 months old
const YOUNG = waitlistPurgeCutoff(NOW, 11); // 11 months old
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const COLUMNS = {
  created_at: "created_at",
  email_confirmed_at: "email_confirmed_at",
  phone_confirmed_at: "phone_confirmed_at",
  last_sign_in_at: "last_sign_in_at",
  invited_at: "invited_at",
  banned_until: "banned_until",
  deleted_at: "deleted_at",
  confirmation_sent_at: "confirmation_sent_at",
  recovery_sent_at: "recovery_sent_at",
  email_change_sent_at: "email_change_sent_at",
  reauthentication_sent_at: "reauthentication_sent_at",
} as const;

beforeEach(async () => {
  process.env.ANALYTICS_SUPER_ADMIN_EMAIL = BOSS;
  await resetDb();
  deleteUser.mockReset();
  deleteUser.mockImplementation(async (id: string) => {
    await prisma.$executeRaw`delete from auth.users where id = ${id}::uuid`;
    return { data: {}, error: null };
  });
  listUsers.mockReset();
  updateUserById.mockReset();
  updateUserById.mockResolvedValue({ data: {}, error: null });
});

type Opts = {
  email?: string | null;
  createdAt?: Date;
  anonymous?: boolean;
  reservation?: boolean;
  /** createdAt of the account's own reservation (default: the account's createdAt). */
  reservationAt?: Date;
  set?: Partial<Record<keyof typeof COLUMNS, Date | null>>;
  isSsoUser?: boolean;
};

/** An auth user (the real trigger makes its profile), aged and flagged. */
async function acct(o: Opts = {}): Promise<{ id: string; email: string | null }> {
  const id = await makeUser({ email: o.email, anonymous: o.anonymous });
  const email = (await prisma.$queryRaw<{ email: string | null }[]>`select email from auth.users where id = ${id}::uuid`)[0].email;
  const set = { created_at: o.createdAt ?? OLD, ...(o.set ?? {}) };
  for (const [col, val] of Object.entries(set)) {
    await prisma.$executeRawUnsafe(`UPDATE auth.users SET ${COLUMNS[col as keyof typeof COLUMNS]} = $1 WHERE id = $2::uuid`, val, id);
  }
  if (o.isSsoUser) await prisma.$executeRaw`update auth.users set is_sso_user = true where id = ${id}::uuid`;
  if (o.reservation && email) {
    await prisma.waitlistEntry.create({ data: { email: email.toLowerCase(), createdAt: o.reservationAt ?? set.created_at ?? OLD } });
  }
  return { id, email };
}

const run = (enabled = true) => purgeUnusedAccounts({ enabled, now: NOW });
const authExists = async (id: string) =>
  (await prisma.$queryRaw<{ n: number }[]>`select count(*)::int as n from auth.users where id = ${id}::uuid`)[0].n === 1;
const profileExists = async (id: string) => (await prisma.profile.count({ where: { id } })) === 1;
const reservationExists = async (email: string) => (await prisma.waitlistEntry.count({ where: { email } })) === 1;

describe("selection: which accounts are deleted", () => {
  it("an unused 13-month-old account with a reservation: profile, reservation and auth user are gone", async () => {
    const a = await acct({ email: "old@example.test", reservation: true });
    expect(await profileExists(a.id)).toBe(true);
    const r = await run();
    expect(r).toMatchObject({ due: 1, deleted: 1, skippedUsed: 0, failed: 0, enabled: true });
    expect(deleteUser).toHaveBeenCalledWith(a.id);
    expect(await authExists(a.id)).toBe(false);
    expect(await profileExists(a.id)).toBe(false);
    expect(await reservationExists("old@example.test")).toBe(false);
  });

  it("the same account at 11 months is untouched", async () => {
    const a = await acct({ email: "young@example.test", createdAt: YOUNG, reservation: true });
    const r = await run();
    expect(r).toMatchObject({ due: 0, deleted: 0, skippedUsed: 0, failed: 0 });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await authExists(a.id)).toBe(true);
    expect(await profileExists(a.id)).toBe(true);
    expect(await reservationExists("young@example.test")).toBe(true);
  });

  it("a confirmed or signed-in account is untouched and keeps its reservation", async () => {
    const confirmed = await acct({ email: "c@example.test", reservation: true, set: { email_confirmed_at: new Date("2025-02-01T00:00:00Z") } });
    const signedIn = await acct({ email: "s@example.test", reservation: true, set: { last_sign_in_at: new Date("2025-02-01T00:00:00Z") } });
    const google = await acct({ email: "g@example.test", reservation: true, set: { email_confirmed_at: OLD, last_sign_in_at: OLD } });
    const r = await run();
    expect(r).toMatchObject({ due: 0, deleted: 0 });
    for (const [a, e] of [[confirmed, "c@example.test"], [signedIn, "s@example.test"], [google, "g@example.test"]] as const) {
      expect(await authExists(a.id)).toBe(true);
      expect(await profileExists(a.id)).toBe(true);
      expect(await reservationExists(e)).toBe(true);
    }
  });

  it("an access email within the last 12 months protects the account (M1: 10 h and 49 h ago, 11 months ago); one 13 months ago does not", async () => {
    for (const col of ["confirmation_sent_at", "recovery_sent_at", "email_change_sent_at", "reauthentication_sent_at"] as const) {
      for (const at of [hoursAgo(10), hoursAgo(49), YOUNG]) {
        await resetDb();
        const a = await acct({ email: "mail@example.test", reservation: true, set: { [col]: at } });
        expect(await run(), `${col} ${at.toISOString()}`).toMatchObject({ due: 0, deleted: 0 });
        expect(await authExists(a.id)).toBe(true);
        expect(await reservationExists("mail@example.test")).toBe(true);
      }
      await resetDb();
      const b = await acct({ email: "mail@example.test", reservation: true, set: { [col]: new Date(OLD.getTime() + 86_400_000) } });
      expect(await run(), col).toMatchObject({ due: 1, deleted: 1 });
      expect(await authExists(b.id)).toBe(false);
    }
  });

  it("M1: created 13 months ago + access email 11 months ago is NOT due; + a reservation made yesterday is NOT due either (both kept)", async () => {
    const mailed = await acct({ email: "m1@example.test", reservation: true, set: { confirmation_sent_at: YOUNG } });
    const reserved = await acct({ email: "m2@example.test", reservation: true, reservationAt: hoursAgo(24) });
    const plain = await acct({ email: "m3@example.test", reservation: true });
    const r = await run();
    expect(r).toMatchObject({ due: 1, deleted: 1, failed: 0 });
    expect(await authExists(mailed.id)).toBe(true);
    expect(await reservationExists("m1@example.test")).toBe(true);
    expect(await authExists(reserved.id)).toBe(true);
    expect(await profileExists(reserved.id)).toBe(true);
    expect(await reservationExists("m2@example.test")).toBe(true);
    expect(await authExists(plain.id)).toBe(false);
  });

  it("L3: an account with an empty or blank address is never selected (SQL and counts)", async () => {
    const blank = await acct({ email: "blank@example.test" });
    await prisma.$executeRaw`update auth.users set email = '' where id = ${blank.id}::uuid`;
    const spaces = await acct({ email: "spaces@example.test" });
    await prisma.$executeRaw`update auth.users set email = '   ' where id = ${spaces.id}::uuid`;
    expect(await selectAuthEligibleIds(NOW)).toEqual([]);
    expect(await run()).toMatchObject({ due: 0, deleted: 0 });
    expect(await authExists(blank.id)).toBe(true);
    expect(await authExists(spaces.id)).toBe(true);
  });

  it("never selects an anonymous guest, the super-admin, an invited, SSO, banned or soft-deleted account", async () => {
    const guest = await acct({ anonymous: true });
    const boss = await acct({ email: BOSS.toUpperCase() });
    const invited = await acct({ email: "i@example.test", set: { invited_at: OLD } });
    const sso = await acct({ email: "sso@example.test", isSsoUser: true });
    const banned = await acct({ email: "b@example.test", set: { banned_until: new Date("2099-01-01T00:00:00Z") } });
    const gone = await acct({ email: "d@example.test", set: { deleted_at: OLD } });
    expect(await run()).toMatchObject({ due: 0, deleted: 0 });
    for (const a of [guest, boss, invited, sso, banned, gone]) expect(await authExists(a.id)).toBe(true);
  });

  it("deletes at most 50 per run, oldest first, and reports the full due count", async () => {
    const ids: string[] = [];
    for (let i = 0; i < UNUSED_ACCOUNT_BATCH + 5; i++) {
      // i = 0 is the oldest
      const a = await acct({ email: `bulk${i}@example.test`, createdAt: new Date(OLD.getTime() - (UNUSED_ACCOUNT_BATCH + 5 - i) * 60_000) });
      ids.push(a.id);
    }
    const first = await run();
    expect(first).toMatchObject({ due: 55, deleted: 50, failed: 0 });
    for (const id of ids.slice(0, 50)) expect(await authExists(id)).toBe(false);
    for (const id of ids.slice(50)) expect(await authExists(id)).toBe(true);
    const second = await run();
    expect(second).toMatchObject({ due: 5, deleted: 5 });
  }, 120_000);

  it("with the switch OFF nothing is deleted and the count is reported", async () => {
    const a = await acct({ email: "off@example.test", reservation: true });
    const orphan = "orphan@example.test";
    await prisma.waitlistEntry.create({ data: { email: orphan, createdAt: OLD } });
    const r = await run(false);
    expect(r).toMatchObject({ due: 1, deleted: 0, failed: 0, enabled: false, orphanReservations: { due: 1, deleted: 0 } });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await authExists(a.id)).toBe(true);
    expect(await profileExists(a.id)).toBe(true);
    expect(await reservationExists("off@example.test")).toBe(true);
    expect(await reservationExists(orphan)).toBe(true);
  });
});

describe("the SQL and the pure predicate agree", () => {
  it("on a matrix of boundary cases", async () => {
    const day = 86_400_000;
    const cases: Opts[] = [
      {},
      { createdAt: new Date(CUTOFF.getTime() - 1) },
      { createdAt: CUTOFF },
      { createdAt: new Date(CUTOFF.getTime() + 1) },
      { createdAt: YOUNG },
      { createdAt: new Date(CUTOFF.getTime() - 400 * day) },
      { set: { email_confirmed_at: OLD } },
      { set: { phone_confirmed_at: OLD } },
      { set: { last_sign_in_at: OLD } },
      { set: { invited_at: OLD } },
      { set: { banned_until: NOW } },
      { set: { deleted_at: OLD } },
      { isSsoUser: true },
      { anonymous: true },
      { email: BOSS },
      { email: BOSS.toUpperCase() },
      // M1: the latest of creation / access email / reservation decides
      { reservation: true },
      { reservation: true, reservationAt: new Date(CUTOFF.getTime() - 1) },
      { reservation: true, reservationAt: CUTOFF },
      { reservation: true, reservationAt: hoursAgo(24) },
      { set: { confirmation_sent_at: YOUNG } },
      { set: { confirmation_sent_at: new Date(CUTOFF.getTime() - 1) } },
      { set: { confirmation_sent_at: CUTOFF } },
      { set: { recovery_sent_at: YOUNG, confirmation_sent_at: OLD } },
      // exact-cutoff boundary for the three other access-email timestamps
      { set: { recovery_sent_at: new Date(CUTOFF.getTime() - 1) } },
      { set: { recovery_sent_at: CUTOFF } },
      { set: { recovery_sent_at: new Date(CUTOFF.getTime() + 1) } },
      { set: { email_change_sent_at: new Date(CUTOFF.getTime() - 1) } },
      { set: { email_change_sent_at: CUTOFF } },
      { set: { email_change_sent_at: new Date(CUTOFF.getTime() + 1) } },
      { set: { reauthentication_sent_at: new Date(CUTOFF.getTime() - 1) } },
      { set: { reauthentication_sent_at: CUTOFF } },
      { set: { reauthentication_sent_at: new Date(CUTOFF.getTime() + 1) } },
      // staff and odd addresses
      { email: "ai@example.test" },
      { email: "AI@Example.test " },
      // btrim() removes spaces only: a tab keeps the address distinct on BOTH sides
      { email: "ai@example.test\t" },
      { email: "   " },
      { email: "" },
      { email: null },
    ];
    for (const col of ["confirmation_sent_at", "recovery_sent_at", "email_change_sent_at", "reauthentication_sent_at"] as const) {
      for (const at of [new Date(THRESHOLD.getTime() - 1), THRESHOLD, new Date(THRESHOLD.getTime() + 1), hoursAgo(1), new Date(CUTOFF.getTime() - 400 * day)]) {
        cases.push({ set: { [col]: at } });
      }
    }
    const made: string[] = [];
    for (const [i, c] of cases.entries()) {
      const a = await acct({ ...c, email: c.anonymous || c.email === null || c.email === "" || c.email === "   " ? undefined : (c.email ?? `m${i}@example.test`) });
      // a NON-anonymous user without a usable address (the app has no phone auth, but the column allows it)
      if (c.email === null) await prisma.$executeRaw`update auth.users set email = null where id = ${a.id}::uuid`;
      if (c.email === "") await prisma.$executeRaw`update auth.users set email = '' where id = ${a.id}::uuid`;
      if (c.email === "   ") await prisma.$executeRaw`update auth.users set email = '   ' where id = ${a.id}::uuid`;
      made.push(a.id);
    }
    process.env.ANALYTICS_AI_ADMIN_EMAILS = "ai@example.test";
    const rows = await prisma.$queryRaw<
      {
        id: string; email: string | null; is_anonymous: boolean; created_at: Date; email_confirmed_at: Date | null; phone_confirmed_at: Date | null;
        last_sign_in_at: Date | null; invited_at: Date | null; banned_until: Date | null; deleted_at: Date | null; is_sso_user: boolean;
        confirmation_sent_at: Date | null; recovery_sent_at: Date | null; email_change_sent_at: Date | null; reauthentication_sent_at: Date | null;
        latest_reservation: Date | null;
      }[]
    >`select id::text as id, email, is_anonymous, created_at, email_confirmed_at, phone_confirmed_at, last_sign_in_at, invited_at, banned_until,
        deleted_at, is_sso_user, confirmation_sent_at, recovery_sent_at, email_change_sent_at, reauthentication_sent_at,
        (select max(w."createdAt") from waitlist_entries w where lower(btrim(w.email)) = lower(btrim(auth.users.email))) as latest_reservation
        from auth.users`;
    const protectedEmails = [BOSS, "ai@example.test"];
    const jsEligible = rows
      .filter((r) => {
        const f: AuthUserFacts = {
          isAnonymous: r.is_anonymous, email: r.email, createdAt: r.created_at, emailConfirmedAt: r.email_confirmed_at,
          phoneConfirmedAt: r.phone_confirmed_at, lastSignInAt: r.last_sign_in_at, invitedAt: r.invited_at, bannedUntil: r.banned_until,
          deletedAt: r.deleted_at, isSsoUser: r.is_sso_user, confirmationSentAt: r.confirmation_sent_at, recoverySentAt: r.recovery_sent_at,
          emailChangeSentAt: r.email_change_sent_at, reauthenticationSentAt: r.reauthentication_sent_at,
          latestReservationAt: r.latest_reservation,
        };
        return notUnusedReason(f, NOW, WAITLIST_RETENTION_MONTHS, protectedEmails) === null;
      })
      .map((r) => r.id)
      .sort();
    const sqlEligible = (await selectAuthEligibleIds(NOW)).sort();
    expect(rows.length).toBe(cases.length);
    expect(sqlEligible).toEqual(jsEligible);
    expect(jsEligible.length).toBeGreaterThan(3);
    expect(jsEligible.length).toBeLessThan(cases.length);
    delete process.env.ANALYTICS_AI_ADMIN_EMAILS;
  }, 120_000);
});

describe("the account must be empty: table by table", () => {
  // One minimal row per BLOCKING rule, owned by or pointing at the account.
  async function seedBlocking(key: string, id: string, other: string) {
    switch (key) {
      case "Coffee.createdBy": return void (await makeCoffee(id));
      case "CoffeeInvite.createdBy": {
        const c = await makeCoffee(other);
        return void (await prisma.coffeeInvite.create({ data: { coffeeId: c.id, token: "ci" + id, createdBy: id } }));
      }
      case "CuppingSession.createdBy": return void (await makeSession({ ownerId: id }));
      case "Evaluation.cupperId": {
        const s = await makeSession({ ownerId: other, isGroup: true, participants: [id] });
        return void (await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: id, draft: true }));
      }
      case "PhysicalEvaluation.evaluatedBy": {
        const s = await makeSession({ ownerId: other });
        return void (await prisma.physicalEvaluation.create({ data: { sessionSampleId: s.samples[0].id, evaluatedBy: id } }));
      }
      case "ExtrinsicData.revealedBy": {
        const s = await makeSession({ ownerId: other });
        return void (await prisma.extrinsicData.create({ data: { sessionSampleId: s.samples[0].id, revealedBy: id } }));
      }
      case "SessionInvite.createdBy": {
        const s = await makeSession({ ownerId: other, isGroup: true });
        return void (await prisma.sessionInvite.create({ data: { sessionId: s.id, token: "si" + id, createdBy: id } }));
      }
      case "SessionParticipant.userId": return void (await makeSession({ ownerId: other, isGroup: true, participants: [id] }));
      case "UserCoffeeHistory.userId": return void (await prisma.userCoffeeHistory.create({ data: { userId: id, tastedAt: new Date() } }));
      case "SavedInsight.createdBy": return void (await prisma.savedInsight.create({ data: { createdBy: id, name: "x", config: {} } }));
      case "WarmupReflection.userId": return void (await prisma.warmupReflection.create({ data: { userId: id, exerciseId: "arrival", feel: "tranquilo" } }));
      case "TastingGroup.createdBy": return void (await prisma.tastingGroup.create({ data: { name: "G", createdBy: id } }));
      case "GroupPost.authorId": {
        const g = await prisma.tastingGroup.create({ data: { name: "G", createdBy: other } });
        return void (await prisma.groupPost.create({ data: { groupId: g.id, authorId: id, body: "hola" } }));
      }
      case "AiChatUsage.userId": return void (await prisma.aiChatUsage.create({ data: { userId: id, day: "2026-11-01", questionCount: 1 } }));
      case "SessionParticipant.excludedBy": {
        const s = await makeSession({ ownerId: other, isGroup: true, participants: [other] });
        const third = await makeUser();
        await prisma.sessionParticipant.create({ data: { sessionId: s.id, userId: third, status: "joined", excludedFromResults: true, excludedBy: id } });
        return;
      }
      default: throw new Error(`no seed for blocking rule ${key}`);
    }
  }

  it("the seed list covers every blocking rule of the manifest", () => {
    const blocking = PROFILE_MANIFEST.map((e) => manifestKey(e.model, e.field)).filter((k) => UNUSED_ACCOUNT_RULES[k].rule === "blocks");
    expect(blocking.length).toBe(15);
  });

  for (const [key, rule] of Object.entries(UNUSED_ACCOUNT_RULES)) {
    if (rule.rule !== "blocks") continue;
    it(`${key}: one row showing use keeps the account, its profile and its reservation`, async () => {
      const other = await makeUser({ email: "other@example.test" });
      const a = await acct({ email: "used@example.test", reservation: true });
      await seedBlocking(key, a.id, other);
      const r = await run();
      expect(r).toMatchObject({ due: 0, deleted: 0, skippedUsed: 1, failed: 0 });
      expect(deleteUser).not.toHaveBeenCalled();
      expect(await authExists(a.id)).toBe(true);
      expect(await profileExists(a.id)).toBe(true);
      expect(await reservationExists("used@example.test")).toBe(true);
    });
  }

  it("a profile that shows use (analytics access, onboarding, role, country, bio) keeps the account", async () => {
    const patches = [
      { analyticsAccess: true },
      { onboardingCompleted: true },
      { role: "roaster" },
      { country: "CO" },
      { bio: "" },
      { avatarUrl: "https://example.test/a.png" },
    ];
    for (const patch of patches) {
      await resetDb();
      const a = await acct({ email: "p@example.test", reservation: true });
      await prisma.profile.update({ where: { id: a.id }, data: patch });
      expect(await run(), JSON.stringify(patch)).toMatchObject({ due: 0, deleted: 0, skippedUsed: 1 });
      expect(await authExists(a.id)).toBe(true);
      expect(await reservationExists("p@example.test")).toBe(true);
    }
  });

  it("another person's rows that merely point at the account: erased grants and ledgers, unlinked roster row, nothing of the other person lost", async () => {
    const q = await makeUser({ email: "q@example.test", name: "Quien" });
    const a = await acct({ email: "ghost@example.test", reservation: true });
    // Q's coffee shared TO the account, Q's session with ledger rows about the account
    const qCoffee = await makeCoffee(q, "Café de Q");
    await prisma.coffeeShare.create({ data: { coffeeId: qCoffee.id, userId: a.id } });
    const qSession = await makeSession({ ownerId: q, isGroup: true });
    await prisma.closeEmailDelivery.create({ data: { sessionId: qSession.id, userId: a.id, status: "skipped" } });
    await prisma.sessionReminderDelivery.create({ data: { sessionId: qSession.id, userId: a.id, kind: "deadline_24h" } });
    await prisma.outboundEmailEvent.create({ data: { kind: "magic_link", actorKey: `u_${a.id}`, recipients: 1 } });
    await prisma.outboundEmailEvent.create({ data: { kind: "magic_link", actorKey: "u_someone-else", recipients: 1 } });
    // Q's group has the account as a LINKED member, plus a pending row typed by address
    const group = await prisma.tastingGroup.create({ data: { name: "Grupo de Q", createdBy: q } });
    const linked = await prisma.tastingGroupMember.create({ data: { groupId: group.id, email: "ghost@example.test", userId: a.id, displayName: "Fantasma" } });
    const pending = await prisma.tastingGroupMember.create({ data: { groupId: group.id, email: "ghost@example.test.other", userId: null } });
    const otherEvent = await prisma.outboundEmailEvent.findFirstOrThrow({ where: { actorKey: "u_someone-else" } });
    // L4: byte-for-byte snapshots of every row the other person owns, before and after
    const snap = async () => {
      const out: Record<string, unknown> = {};
      const one = async (label: string, table: string, id: string) => {
        out[label] = (await prisma.$queryRawUnsafe<{ j: unknown }[]>(`select to_jsonb(t) as j from "${table}" t where id = $1`, id))[0]?.j ?? null;
      };
      await one("profile", "profiles", q);
      await one("coffee", "coffees", qCoffee.id);
      await one("session", "cupping_sessions", qSession.id);
      await one("group", "tasting_groups", group.id);
      await one("pending", "tasting_group_members", pending.id);
      await one("event", "outbound_email_events", otherEvent.id);
      const m = (await prisma.$queryRawUnsafe<{ j: Record<string, unknown> }[]>(`select to_jsonb(t) as j from "tasting_group_members" t where id = $1`, linked.id))[0]?.j ?? {};
      // the linked roster row legitimately loses ONLY its link
      out["linked"] = { ...m, userId: null };
      return out;
    };
    const before = await snap();

    const r = await run();
    expect(r).toMatchObject({ due: 1, deleted: 1, skippedUsed: 0, failed: 0 });
    expect(await authExists(a.id)).toBe(false);
    expect(await profileExists(a.id)).toBe(false);
    expect(await reservationExists("ghost@example.test")).toBe(false);
    // erased: the grant and the account's own ledgers
    expect(await prisma.coffeeShare.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.closeEmailDelivery.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.sessionReminderDelivery.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.outboundEmailEvent.count({ where: { actorKey: `u_${a.id}` } })).toBe(0);
    // Q's data is intact
    expect(await prisma.outboundEmailEvent.count({ where: { actorKey: "u_someone-else" } })).toBe(1);
    expect(await prisma.coffee.count({ where: { id: qCoffee.id, deletedAt: null } })).toBe(1);
    expect(await prisma.cuppingSession.count({ where: { id: qSession.id } })).toBe(1);
    expect(await prisma.tastingGroup.count({ where: { id: group.id } })).toBe(1);
    expect(await profileExists(q)).toBe(true);
    expect(await snap()).toEqual(before);
    // the roster row stays with the address Q typed and loses only the link
    const after = await prisma.tastingGroupMember.findUniqueOrThrow({ where: { id: linked.id } });
    expect(after.userId).toBeNull();
    expect(after.email).toBe("ghost@example.test");
    expect(after.displayName).toBe("Fantasma");
    expect(await prisma.tastingGroupMember.count({ where: { id: pending.id } })).toBe(1);
  });

  it("matches the reservation by exact normalised address, never a pattern", async () => {
    const a = await acct({ email: "a_b@example.test", reservation: true });
    await prisma.waitlistEntry.create({ data: { email: "axb@example.test" } });
    await prisma.waitlistEntry.create({ data: { email: "a_b@example.test.mx" } });
    expect(await run()).toMatchObject({ deleted: 1 });
    expect(await authExists(a.id)).toBe(false);
    expect(await reservationExists("a_b@example.test")).toBe(false);
    expect(await reservationExists("axb@example.test")).toBe(true);
    expect(await reservationExists("a_b@example.test.mx")).toBe(true);
  });
});

describe("reservations with no auth user at all", () => {
  it("a 13-month-old reservation with no account is deleted; an 11-month-old one and one whose account exists are kept", async () => {
    await prisma.waitlistEntry.create({ data: { email: "nobody@example.test", createdAt: OLD } });
    await prisma.waitlistEntry.create({ data: { email: "recent@example.test", createdAt: YOUNG } });
    await prisma.waitlistEntry.create({ data: { email: "Mixed@Example.test", createdAt: OLD } });
    const used = await acct({ email: "mixed@example.test", set: { email_confirmed_at: OLD } });
    const r = await run();
    expect(r.orphanReservations).toEqual({ due: 1, deleted: 1 });
    expect(await reservationExists("nobody@example.test")).toBe(false);
    expect(await reservationExists("recent@example.test")).toBe(true);
    expect(await prisma.waitlistEntry.count({ where: { email: "Mixed@Example.test" } })).toBe(1);
    expect(await authExists(used.id)).toBe(true);
  });
});

describe("the admin API fails", () => {
  it("the rows are already gone; the auth user stays a candidate and the NEXT run retries it", async () => {
    const a = await acct({ email: "retry@example.test", reservation: true });
    deleteUser.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure" } });
    const first = await run();
    expect(first).toMatchObject({ due: 1, deleted: 0, failed: 1 });
    expect(deleteUser).toHaveBeenCalledTimes(3); // the bounded retry of account deletion
    expect(await profileExists(a.id)).toBe(false);
    expect(await reservationExists("retry@example.test")).toBe(false);
    expect(await authExists(a.id)).toBe(true);

    deleteUser.mockReset();
    deleteUser.mockImplementation(async (id: string) => {
      await prisma.$executeRaw`delete from auth.users where id = ${id}::uuid`;
      return { data: {}, error: null };
    });
    const second = await run();
    expect(second).toMatchObject({ due: 1, deleted: 1, failed: 0 });
    expect(await authExists(a.id)).toBe(false);
  });

  it("a failure on one account does not stop the others", async () => {
    const bad = await acct({ email: "bad@example.test", createdAt: new Date(OLD.getTime() - 60_000) });
    const good = await acct({ email: "good@example.test" });
    deleteUser.mockImplementation(async (id: string) => {
      if (id === bad.id) return { data: null, error: { status: 500, code: "unexpected_failure" } };
      await prisma.$executeRaw`delete from auth.users where id = ${id}::uuid`;
      return { data: {}, error: null };
    });
    const r = await run();
    expect(r).toMatchObject({ due: 2, deleted: 1, failed: 1 });
    expect(await authExists(good.id)).toBe(false);
    expect(await authExists(bad.id)).toBe(true);
  });
});

describe("moveWaitlistEntry (email change)", () => {
  it("moves the row to the new address, case-insensitively", async () => {
    await prisma.waitlistEntry.create({ data: { email: "Old@Example.test", locale: "en", source: "landing" } });
    expect(await moveWaitlistEntry("old@example.test", "New@Example.test")).toBe("moved");
    expect(await prisma.waitlistEntry.count({ where: { email: "new@example.test" } })).toBe(1);
    expect(await prisma.waitlistEntry.count({ where: { email: { contains: "old", mode: "insensitive" } } })).toBe(0);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: "new@example.test" } })).locale).toBe("en");
  });
  it("does nothing without a row for the old address, or when the new address already has one", async () => {
    expect(await moveWaitlistEntry("none@example.test", "x@example.test")).toBe("no_row");
    await prisma.waitlistEntry.create({ data: { email: "a@example.test" } });
    await prisma.waitlistEntry.create({ data: { email: "b@example.test" } });
    expect(await moveWaitlistEntry("a@example.test", "b@example.test")).toBe("target_exists");
    expect(await prisma.waitlistEntry.count()).toBe(2);
    expect(await moveWaitlistEntry("a@example.test", "A@example.test")).toBe("same");
  });
  it("never matches by pattern", async () => {
    await prisma.waitlistEntry.create({ data: { email: "axb@example.test" } });
    expect(await moveWaitlistEntry("a_b@example.test", "z@example.test")).toBe("no_row");
    expect(await prisma.waitlistEntry.count({ where: { email: "axb@example.test" } })).toBe(1);
  });
});

describe("co-cupper evaluation count is scoped to the shared sessions", () => {
  it("counts only the evaluations made in sessions shared with the viewer", async () => {
    const viewer = await makeUser({ name: "Viewer" });
    const x = await makeUser({ name: "Equis" });
    const y = await makeUser({ name: "Ye" });
    const shared = await makeSession({ ownerId: viewer, isGroup: true, participants: [x], samples: [{}, {}] });
    for (const s of shared.samples) await makeEvaluation({ sampleId: s.id, sessionId: shared.id, cupperId: x });
    // X also evaluated three times elsewhere: a session the viewer is not part of
    const elsewhere = await makeSession({ ownerId: y, isGroup: true, participants: [x], samples: [{}, {}, {}] });
    for (const s of elsewhere.samples) await makeEvaluation({ sampleId: s.id, sessionId: elsewhere.id, cupperId: x });

    const list = await getCoCupperCandidates(viewer);
    const card = list.find((c) => c.userId === x);
    expect(card?.sessionCount).toBe(1);
    expect(card?.evaluationCount).toBe(2);
    expect(list.find((c) => c.userId === y)).toBeUndefined();
  });

  it("counts SUBMITTED evaluations only, and none of a cupper the owner excluded", async () => {
    const viewer = await makeUser({ name: "Viewer2" });
    const x = await makeUser({ name: "Equis2" });
    const z = await makeUser({ name: "Zeta2" });
    const s = await makeSession({ ownerId: viewer, isGroup: true, participants: [x, z], samples: [{}, {}, {}] });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: x });
    await makeEvaluation({ sampleId: s.samples[1].id, sessionId: s.id, cupperId: x });
    await makeEvaluation({ sampleId: s.samples[2].id, sessionId: s.id, cupperId: x, draft: true });
    await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: z });
    await prisma.sessionParticipant.updateMany({ where: { sessionId: s.id, userId: z }, data: { excludedFromResults: true } });
    const list = await getCoCupperCandidates(viewer);
    expect(list.find((c) => c.userId === x)?.evaluationCount).toBe(2);
    expect(list.find((c) => c.userId === z)?.evaluationCount).toBe(0);
  });

});

describe("races between selection and deletion (M2)", () => {
  it("a blocking row inserted AFTER selection is caught by the in-transaction plan check: nothing deleted, counted skippedUsed", async () => {
    const a = await acct({ email: "race@example.test", reservation: true });
    const other = await makeUser({ email: "owner@example.test" });
    const r = await purgeUnusedAccounts({
      enabled: true,
      now: NOW,
      hooks: {
        // after selection the account joins a session (a Cascade FK: without the plan check it would be dropped silently)
        afterSelect: async () => void (await makeSession({ ownerId: other, isGroup: true, participants: [a.id] })),
      },
    });
    expect(r).toMatchObject({ deleted: 0, skippedUsed: 1, failed: 0 });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await authExists(a.id)).toBe(true);
    expect(await profileExists(a.id)).toBe(true);
    expect(await reservationExists("race@example.test")).toBe(true);
    expect(await prisma.sessionParticipant.count({ where: { userId: a.id } })).toBe(1);
  });

  it("a Restrict-FK blocking row inserted after selection is a skip, not a failure", async () => {
    const a = await acct({ email: "race2@example.test", reservation: true });
    const r = await purgeUnusedAccounts({
      enabled: true,
      now: NOW,
      hooks: { afterSelect: async () => void (await makeCoffee(a.id)) },
    });
    expect(r).toMatchObject({ deleted: 0, skippedUsed: 1, failed: 0 });
    expect(await profileExists(a.id)).toBe(true);
    expect(await reservationExists("race2@example.test")).toBe(true);
  });

  it("a first sign-in landing AFTER selection is caught by the in-transaction auth re-check: profile, reservation and auth user all stay", async () => {
    const a = await acct({ email: "race3@example.test", reservation: true });
    const r = await purgeUnusedAccounts({
      enabled: true,
      now: NOW,
      hooks: {
        afterSelect: async () => void (await prisma.$executeRaw`update auth.users set last_sign_in_at = ${NOW}, email_confirmed_at = ${NOW} where id = ${a.id}::uuid`),
      },
    });
    expect(r).toMatchObject({ deleted: 0, skippedUsed: 1, failed: 0 });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await authExists(a.id)).toBe(true);
    expect(await profileExists(a.id)).toBe(true);
    expect(await reservationExists("race3@example.test")).toBe(true);
  });

  it("a sign-in landing between the transaction and the auth delete keeps the auth user (signedInDuringPurge)", async () => {
    const a = await acct({ email: "race4@example.test", reservation: true });
    const r = await purgeUnusedAccounts({
      enabled: true,
      now: NOW,
      hooks: {
        beforeAuthDelete: async () => void (await prisma.$executeRaw`update auth.users set last_sign_in_at = ${NOW}, email_confirmed_at = ${NOW} where id = ${a.id}::uuid`),
      },
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(await authExists(a.id)).toBe(true);
    expect(r).toMatchObject({ deleted: 0, failed: 0 });
    expect(r.skippedUsed).toBe(1);
  });

  it("without any race the same hooks change nothing (control)", async () => {
    const a = await acct({ email: "race5@example.test", reservation: true });
    const r = await purgeUnusedAccounts({ enabled: true, now: NOW, hooks: { afterSelect: async () => {}, beforeAuthDelete: async () => {} } });
    expect(r).toMatchObject({ deleted: 1, skippedUsed: 0 });
    expect(await authExists(a.id)).toBe(false);
  });
});

describe("orphan reservations are NOT protected by any email-change record (M-a)", () => {
  it("an over-age reservation matching no account is deleted even when some user's STALE record names its address", async () => {
    const mover = await makeUser({ email: "new-address@example.test" });
    // a record that never completed: the previous design's exclusion kept the
    // reservation it names forever; now it protects nothing
    await prisma.$executeRaw`update auth.users set raw_app_meta_data = ${JSON.stringify({
      email_change: { from: "Old-Address@Example.test", to: "somewhere-else@example.test" },
      email_change_from: "Old-Address@Example.test",
    })}::jsonb where id = ${mover}::uuid`;
    await prisma.waitlistEntry.create({ data: { email: "old-address@example.test", createdAt: OLD } });
    await prisma.waitlistEntry.create({ data: { email: "gone@example.test", createdAt: OLD } });
    const r = await run();
    expect(r.orphanReservations).toEqual({ due: 2, deleted: 2 });
    expect(await reservationExists("old-address@example.test")).toBe(false);
    expect(await reservationExists("gone@example.test")).toBe(false);
  });
});

describe("email change: { from, to } in app_metadata only; the move needs the account's address to BE `to`", () => {
  const victim = "victim@example.test";
  const mine = "mine-new@example.test";
  const rec = (from: string, to: string) => ({ email_change: { from, to } });

  it("a forged user_metadata carrying ANOTHER person's address moves nothing", async () => {
    const attacker = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: victim, locale: "es", source: "landing" } });
    const before = await prisma.waitlistEntry.findMany({ orderBy: { email: "asc" } });
    await moveReservationAfterEmailChange({
      id: attacker,
      email: mine,
      new_email: "",
      // what a signed-in user can write with the public key
      user_metadata: rec(victim, mine),
    } as never);
    expect(await prisma.waitlistEntry.findMany({ orderBy: { email: "asc" } })).toEqual(before);
    expect(await reservationExists(victim)).toBe(true);
    expect(await reservationExists(mine)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("a completed change (no session needed: the user object from verifyOtp is enough) moves the row, then clears ONLY its key", async () => {
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: "my-old@example.test", locale: "en", source: "landing" } });
    await moveReservationAfterEmailChange({
      id: me,
      email: mine,
      new_email: "",
      app_metadata: { provider: "email", providers: ["email"], ...rec("My-Old@example.test", "MINE-new@example.test") },
    });
    expect(await reservationExists("my-old@example.test")).toBe(false);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: mine } })).locale).toBe("en");
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(me, { app_metadata: { email_change: null } });
  });

  it("a second call after the move (record cleared) does nothing", async () => {
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: "my-old3@example.test" } });
    const user = { id: me, email: mine, new_email: "", app_metadata: rec("my-old3@example.test", mine) };
    await moveReservationAfterEmailChange(user);
    updateUserById.mockClear();
    await moveReservationAfterEmailChange({ ...user, app_metadata: { email_change: null } });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(await reservationExists(mine)).toBe(true);
  });

  it("`to` is not the account's current address: nothing moves, nothing is written, the record stays", async () => {
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: "my-old4@example.test" } });
    await moveReservationAfterEmailChange({ id: me, email: mine, new_email: "", app_metadata: rec("my-old4@example.test", "another@example.test") });
    expect(await reservationExists("my-old4@example.test")).toBe(true);
    expect(await reservationExists(mine)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("belt and braces: the old address is held by ANOTHER auth user: nothing moves and the record is NOT cleared", async () => {
    await makeUser({ email: victim });
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: victim } });
    await moveReservationAfterEmailChange({ id: me, email: mine, new_email: "", app_metadata: rec(victim, mine) });
    expect(await reservationExists(victim)).toBe(true);
    expect(await reservationExists(mine)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("first of two secure confirmations (new_email still pending): nothing moves", async () => {
    const me = await makeUser({ email: "still-old@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "still-old@example.test" } });
    await moveReservationAfterEmailChange({ id: me, email: "still-old@example.test", new_email: mine, app_metadata: rec("still-old@example.test", mine) });
    expect(await reservationExists("still-old@example.test")).toBe(true);
    expect(await reservationExists(mine)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("the person never presses \"Si, continuar\" or presses \"No soy yo\": the move never looks at a session, so the row has moved", async () => {
    // confirmEmailToken calls the move right after verifyOtp, before any session
    // branch (source-order test in tests/emailChangeRules.test.ts); here, the
    // move with only what verifyOtp returned
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: "my-old5@example.test", locale: "es" } });
    await moveReservationAfterEmailChange({ id: me, email: mine, new_email: null, app_metadata: rec("my-old5@example.test", mine) });
    expect(await reservationExists("my-old5@example.test")).toBe(false);
    expect(await reservationExists(mine)).toBe(true);
  });

  it("a failing admin clear never throws (the sign-in goes on) and the row has still moved", async () => {
    const me = await makeUser({ email: mine });
    await prisma.waitlistEntry.create({ data: { email: "my-old2@example.test" } });
    updateUserById.mockRejectedValue(Object.assign(new Error("x"), { code: "boom" }));
    await expect(
      moveReservationAfterEmailChange({ id: me, email: mine, new_email: "", app_metadata: rec("my-old2@example.test", mine) }),
    ).resolves.toBeUndefined();
    expect(await reservationExists(mine)).toBe(true);
  });

  it("requesting a change records { from, to } (server-read, normalised) and sends ONLY that key; a failure does not throw", async () => {
    await recordEmailChange({ id: "11111111-1111-1111-1111-111111111111", email: "Old@Example.test" }, " New@Example.test");
    expect(updateUserById).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", {
      app_metadata: { email_change: { from: "old@example.test", to: "new@example.test" } },
    });
    updateUserById.mockResolvedValue({ data: null, error: { status: 500, code: "unexpected_failure" } });
    await expect(recordEmailChange({ id: "x", email: "o@e.test" }, "n@e.test")).resolves.toBeUndefined();
  });

  it("a second request overwrites the record: the first `to` can no longer complete a move", async () => {
    const me = await makeUser({ email: "first-new@example.test" });
    await prisma.waitlistEntry.create({ data: { email: "orig@example.test" } });
    await recordEmailChange({ id: me, email: "orig@example.test" }, "first-new@example.test");
    await recordEmailChange({ id: me, email: "orig@example.test" }, "second-new@example.test");
    // what GoTrue now holds: the LAST write
    const last = updateUserById.mock.calls.at(-1)![1] as { app_metadata: Record<string, unknown> };
    expect(last.app_metadata).toEqual({ email_change: { from: "orig@example.test", to: "second-new@example.test" } });
    // the account ends up on the FIRST address: the record is inert
    await moveReservationAfterEmailChange({ id: me, email: "first-new@example.test", new_email: "", app_metadata: last.app_metadata });
    expect(await reservationExists("orig@example.test")).toBe(true);
    expect(await reservationExists("first-new@example.test")).toBe(false);
  });
});

describe("listAllAuthUsersStrict", () => {
  it("returns the full list when the last page has no next page", async () => {
    listUsers
      .mockResolvedValueOnce({ data: { users: [{ id: "1", email: "a@e.test" }], nextPage: 2 }, error: null })
      .mockResolvedValueOnce({ data: { users: [{ id: "2", email: "b@e.test" }], nextPage: null }, error: null });
    expect((await listAllAuthUsersStrict()).map((u) => u.id)).toEqual(["1", "2"]);
  });
  it("THROWS when the page cap is reached while a next page still exists (never a silent partial list)", async () => {
    listUsers.mockImplementation(async ({ page }: { page: number }) => ({
      data: { users: [{ id: String(page), email: `u${page}@e.test` }], nextPage: page + 1 },
      error: null,
    }));
    await expect(listAllAuthUsersStrict()).rejects.toThrow("auth_list_truncated");
    expect(listUsers).toHaveBeenCalledTimes(50);
  });
  it("throws on a listing error", async () => {
    listUsers.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    await expect(listAllAuthUsersStrict()).rejects.toThrow("auth_list_failed");
  });
});
