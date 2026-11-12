import { describe, expect, it } from "vitest";
import { evaluateJoin, joinRefusalCode, joinScreenFor, isSameAnonymousGuest, existingUserAction, type JoinInvite, type JoinSession } from "@/lib/joinRules";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const future = new Date(NOW.getTime() + 3_600_000);
const past = new Date(NOW.getTime() - 1);

const invite: JoinInvite = { active: true, expiresAt: null, maxUses: null, useCount: 0 };
const session: JoinSession = {
  id: "s1",
  status: "active",
  closesAt: null,
  startedAt: null,
  isGroup: true,
  isAsync: false,
  createdBy: "owner",
  entriesLocked: false,
};
const visitor = { userId: null, isMember: false };
const newcomer = { userId: "u2", isMember: false };
const member = { userId: "u3", isMember: true };

const ev = (over: {
  invite?: Partial<JoinInvite> | null;
  session?: Partial<JoinSession> | null;
  viewer?: { userId: string | null; isMember: boolean };
}) =>
  evaluateJoin(
    {
      invite: over.invite === null ? null : { ...invite, ...over.invite },
      session: over.session === null ? null : { ...session, ...over.session },
      viewer: over.viewer ?? visitor,
    },
    "es",
    NOW,
  );

describe("evaluateJoin", () => {
  it("admits a visitor to an open unstarted session", () => {
    expect(ev({})).toEqual({ kind: "ok", late: false });
  });
  it("flags a latecomer on a started session", () => {
    expect(ev({ session: { startedAt: past } })).toEqual({ kind: "ok", late: true });
  });
  it("unknown token and solo session are invalid", () => {
    expect(ev({ invite: null }).kind).toBe("invalid");
    expect(ev({ session: null }).kind).toBe("invalid");
    expect(ev({ session: { isGroup: false } }).kind).toBe("invalid");
  });
  it("a closed session refuses a visitor (so no anonymous user is minted)", () => {
    expect(ev({ session: { status: "closed" } }).kind).toBe("closed");
    expect(ev({ session: { closesAt: past } }).kind).toBe("closed");
  });
  it("closed wins over an expired or exhausted link", () => {
    expect(ev({ session: { status: "closed" }, invite: { expiresAt: past } }).kind).toBe("closed");
    expect(ev({ session: { status: "closed" }, invite: { maxUses: 1, useCount: 1 } }).kind).toBe("closed");
  });
  it("expired, revoked and exhausted links are distinct states", () => {
    expect(ev({ invite: { expiresAt: past } }).kind).toBe("expired");
    expect(ev({ invite: { expiresAt: future } }).kind).toBe("ok");
    expect(ev({ invite: { active: false } }).kind).toBe("expired");
    expect(ev({ invite: { maxUses: 5, useCount: 5 } }).kind).toBe("exhausted");
    expect(ev({ invite: { maxUses: 5, useCount: 4 } }).kind).toBe("ok");
  });
  it("entries closed refuses newcomers", () => {
    expect(ev({ session: { entriesLocked: true } }).kind).toBe("entries_closed");
    expect(ev({ session: { entriesLocked: true }, viewer: newcomer }).kind).toBe("entries_closed");
  });
  it("owner and members go straight in even with a dead link", () => {
    const dead = {
      invite: { active: false, maxUses: 1, useCount: 1, expiresAt: past },
      session: { entriesLocked: true },
    };
    expect(ev({ ...dead, viewer: member })).toEqual({
      kind: "redirect",
      href: "/es/app/sessions/s1/waiting",
    });
    expect(ev({ ...dead, viewer: { userId: "owner", isMember: false } })).toEqual({
      kind: "redirect",
      href: "/es/app/sessions/s1/cup",
    });
  });
  it("members of a closed session land on results; async members on /cup", () => {
    expect(ev({ session: { status: "closed" }, viewer: member })).toEqual({
      kind: "redirect",
      href: "/es/app/sessions/s1/results",
    });
    expect(ev({ session: { isAsync: true }, viewer: member })).toEqual({
      kind: "redirect",
      href: "/es/app/sessions/s1/cup",
    });
  });
  it("a solo-session link is invalid even for its owner", () => {
    expect(ev({ session: { isGroup: false }, viewer: { userId: "owner", isMember: false } }).kind).toBe("invalid");
  });
});

// checkJoinable (app/actions/join.ts) answers a guest with these codes BEFORE
// an anonymous user is created; they must match what joinViaToken throws.
describe("joinRefusalCode", () => {
  it("entries closed is refused before a guest is minted", () => {
    expect(joinRefusalCode(ev({ session: { entriesLocked: true } }))).toBe("entries_closed");
  });
  it("a revoked link reads as expired", () => {
    expect(joinRefusalCode(ev({ invite: { active: false } }))).toBe("token_expired");
  });
  it("maps the other refusals to joinViaToken's codes", () => {
    expect(joinRefusalCode(ev({ session: { status: "closed" } }))).toBe("session_closed");
    expect(joinRefusalCode(ev({ invite: { expiresAt: past } }))).toBe("token_expired");
    expect(joinRefusalCode(ev({ invite: { maxUses: 1, useCount: 1 } }))).toBe("token_exhausted");
    expect(joinRefusalCode(ev({ invite: null }))).toBe("invalid_token");
  });
  it("an admissible link is not a refusal", () => {
    expect(joinRefusalCode(ev({}))).toBeNull();
    expect(joinRefusalCode(ev({ viewer: member }))).toBeNull();
  });
});

describe("joinScreenFor (F-guest-4)", () => {
  const kinds = ["redirect", "ok", "closed", "expired", "exhausted", "entries_closed", "invalid"] as const;
  it("asks an anonymous viewer who they are for redirect and ok only", () => {
    for (const k of kinds) {
      const expected = k === "redirect" || k === "ok" ? "identity" : "decision";
      expect(joinScreenFor(k, { userId: "g", isAnonymous: true })).toBe(expected);
    }
  });
  it("never changes anything for a registered user", () => {
    for (const k of kinds) {
      expect(joinScreenFor(k, { userId: "r", isAnonymous: false })).toBe("decision");
    }
  });
  it("never changes anything when nobody is signed in", () => {
    for (const k of kinds) {
      expect(joinScreenFor(k, { userId: null, isAnonymous: false })).toBe("decision");
      expect(joinScreenFor(k, { userId: null, isAnonymous: true })).toBe("decision");
    }
  });
  it("an owner is never asked, for every decision kind", () => {
    for (const k of kinds) {
      expect(joinScreenFor(k, { userId: "o", isAnonymous: true, isOwner: true })).toBe("decision");
      expect(joinScreenFor(k, { userId: "o", isAnonymous: false, isOwner: true })).toBe("decision");
    }
  });
});

describe("isSameAnonymousGuest", () => {
  it("matches only the same anonymous user", () => {
    expect(isSameAnonymousGuest("a", { id: "a", is_anonymous: true })).toBe(true);
    expect(isSameAnonymousGuest("a", { id: "b", is_anonymous: true })).toBe(false);
    expect(isSameAnonymousGuest("a", { id: "a", is_anonymous: false })).toBe(false);
    expect(isSameAnonymousGuest("a", { id: "a" })).toBe(false);
    expect(isSameAnonymousGuest("a", null)).toBe(false);
  });
});

describe("existingUserAction", () => {
  it("creates when nobody is signed in", () => {
    expect(existingUserAction(null, null)).toBe("create");
    expect(existingUserAction(null, "x")).toBe("create");
  });
  it("leaves a registered user alone", () => {
    expect(existingUserAction({ id: "r", is_anonymous: false }, "r")).toBe("registered");
  });
  it("reuses only the anonymous user this tab created", () => {
    expect(existingUserAction({ id: "g", is_anonymous: true }, "g")).toBe("reuse");
    expect(existingUserAction({ id: "g", is_anonymous: true }, "other")).toBe("identity");
    expect(existingUserAction({ id: "g", is_anonymous: true }, null)).toBe("identity");
  });
});
