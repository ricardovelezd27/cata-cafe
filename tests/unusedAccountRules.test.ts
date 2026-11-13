import { describe, expect, it } from "vitest";
import { manifestKey, PROFILE_MANIFEST } from "@/lib/accountDeletion/manifest";
import {
  RECENT_ACCESS_EMAIL_HOURS,
  UNUSED_ACCOUNT_RULES,
  notUnusedReason,
  planUnusedAccountDeletion,
  profileUsedReasons,
  recentAccessEmailThreshold,
  type AuthUserFacts,
  type ProfileFacts,
} from "@/lib/unusedAccountRules";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";

const NOW = new Date("2026-11-13T06:00:00.000Z");
const MONTHS = 12;
const CUTOFF = waitlistPurgeCutoff(NOW, MONTHS); // 2025-11-13T06:00:00.000Z

function user(over: Partial<AuthUserFacts> = {}): AuthUserFacts {
  return {
    isAnonymous: false,
    email: "ana@example.test",
    createdAt: new Date(CUTOFF.getTime() - 86_400_000),
    emailConfirmedAt: null,
    phoneConfirmedAt: null,
    lastSignInAt: null,
    invitedAt: null,
    bannedUntil: null,
    deletedAt: null,
    isSsoUser: false,
    confirmationSentAt: null,
    recoverySentAt: null,
    emailChangeSentAt: null,
    reauthenticationSentAt: null,
    latestReservationAt: null,
    ...over,
  };
}
const reason = (over: Partial<AuthUserFacts> = {}, protectedEmails: string[] = []) =>
  notUnusedReason(user(over), NOW, MONTHS, protectedEmails);

describe("notUnusedReason (the 'never used' predicate)", () => {
  it("selects a plain unconfirmed, never-signed-in account older than the cutoff", () => {
    expect(reason()).toBeNull();
  });
  it("never selects an anonymous guest", () => expect(reason({ isAnonymous: true, email: null })).toBe("anonymous"));
  it("never selects an account without an address", () => expect(reason({ email: null })).toBe("no_email"));
  it("never selects a protected address (super-admin, AI admins), any case", () => {
    expect(reason({ email: "Boss@Example.test" }, ["boss@example.test"])).toBe("protected_email");
    expect(reason({ email: " boss@example.test " }, ["boss@example.test"])).toBe("protected_email");
    expect(reason({ email: "other@example.test" }, ["boss@example.test"])).toBeNull();
  });
  it("never selects a confirmed account (a Google account is confirmed at creation)", () => {
    expect(reason({ emailConfirmedAt: new Date("2025-01-01T00:00:00Z") })).toBe("confirmed");
    expect(reason({ phoneConfirmedAt: new Date("2025-01-01T00:00:00Z") })).toBe("confirmed");
  });
  it("never selects an account that signed in", () => {
    expect(reason({ lastSignInAt: new Date("2025-01-01T00:00:00Z") })).toBe("signed_in");
  });
  it("never selects an invited, SSO, banned or soft-deleted account (somebody acted on it)", () => {
    expect(reason({ invitedAt: new Date("2025-01-01T00:00:00Z") })).toBe("invited");
    expect(reason({ isSsoUser: true })).toBe("sso");
    expect(reason({ bannedUntil: new Date("2099-01-01T00:00:00Z") })).toBe("banned");
    expect(reason({ deletedAt: new Date("2025-01-01T00:00:00Z") })).toBe("soft_deleted");
  });

  describe("age boundary: created strictly BEFORE the cutoff", () => {
    it("one millisecond before the cutoff is selected", () => {
      expect(reason({ createdAt: new Date(CUTOFF.getTime() - 1) })).toBeNull();
    });
    it("exactly at the cutoff is NOT selected", () => {
      expect(reason({ createdAt: CUTOFF })).toBe("too_recent");
    });
    it("after the cutoff (11 months old) is not selected", () => {
      expect(reason({ createdAt: new Date("2025-12-13T06:00:00Z") })).toBe("too_recent");
    });
    it("uses calendar months through waitlistPurgeCutoff", () => {
      const end = new Date("2026-03-31T00:00:00Z"); // minus 12 months = 2025-03-31
      const u = user({ createdAt: new Date("2025-03-30T23:59:59.999Z") });
      expect(notUnusedReason(u, end, 12)).toBeNull();
      expect(notUnusedReason(user({ createdAt: new Date("2025-03-31T00:00:00Z") }), end, 12)).toBe("too_recent");
    });
  });

  describe("access email boundary: recent only when sent strictly AFTER now - 48 h", () => {
    const threshold = recentAccessEmailThreshold(NOW);
    it("the window is 48 hours", () => {
      expect(RECENT_ACCESS_EMAIL_HOURS).toBe(48);
      expect(NOW.getTime() - threshold.getTime()).toBe(48 * 3_600_000);
    });
    for (const field of ["confirmationSentAt", "recoverySentAt", "emailChangeSentAt", "reauthenticationSentAt"] as const) {
      it(`${field}: 10 hours ago protects, 1 ms inside the window protects, exactly 48 h and older do not`, () => {
        expect(reason({ [field]: new Date(NOW.getTime() - 10 * 3_600_000) })).toBe("access_email_recent");
        expect(reason({ [field]: new Date(threshold.getTime() + 1) })).toBe("access_email_recent");
        // outside the 48 h window the 12-month rule (M1) decides: still recent
        expect(reason({ [field]: threshold })).toBe("too_recent");
        expect(reason({ [field]: new Date(threshold.getTime() - 1) })).toBe("too_recent");
      });
    }
  });
});

describe("the 12 months count from the LATEST of creation, last access email and reservation (M1)", () => {
  const day = 86_400_000;
  const thirteenMonthsAgo = new Date(CUTOFF.getTime() - 30 * day);
  const elevenMonthsAgo = new Date(CUTOFF.getTime() + 30 * day);
  const yesterday = new Date(NOW.getTime() - day);
  it("an account created 13 months ago with nothing else is due", () => {
    expect(reason({ createdAt: thirteenMonthsAgo })).toBeNull();
  });
  it("created 13 months ago, access email 11 months ago: NOT due", () => {
    for (const field of ["confirmationSentAt", "recoverySentAt", "emailChangeSentAt", "reauthenticationSentAt"] as const) {
      expect(reason({ createdAt: thirteenMonthsAgo, [field]: elevenMonthsAgo }), field).toBe("too_recent");
    }
  });
  it("created 13 months ago, access email 13 months ago too: due", () => {
    expect(reason({ createdAt: thirteenMonthsAgo, confirmationSentAt: new Date(CUTOFF.getTime() - 1) })).toBeNull();
    // exactly at the cutoff is not before it
    expect(reason({ createdAt: thirteenMonthsAgo, confirmationSentAt: CUTOFF })).toBe("too_recent");
  });
  it("created 13 months ago, reservation created yesterday: NOT due", () => {
    expect(reason({ createdAt: thirteenMonthsAgo, latestReservationAt: yesterday })).toBe("reservation_recent");
  });
  it("a reservation exactly at the cutoff is not old enough; one millisecond before is", () => {
    expect(reason({ createdAt: thirteenMonthsAgo, latestReservationAt: CUTOFF })).toBe("reservation_recent");
    expect(reason({ createdAt: thirteenMonthsAgo, latestReservationAt: new Date(CUTOFF.getTime() - 1) })).toBeNull();
  });
  it("an account with an empty-string or blank address is never selected", () => {
    expect(reason({ email: "" })).toBe("no_email");
    expect(reason({ email: "   " })).toBe("no_email");
  });
});

describe("UNUSED_ACCOUNT_RULES", () => {
  it("has a rule for exactly every manifest entry (a forgotten table fails here)", () => {
    const manifest = PROFILE_MANIFEST.map((e) => manifestKey(e.model, e.field)).sort();
    expect(Object.keys(UNUSED_ACCOUNT_RULES).sort()).toEqual(manifest);
  });
  it("never lets a row that shows use be erased or unlinked, and never blocks on bookkeeping", () => {
    expect(UNUSED_ACCOUNT_RULES["WaitlistEntry.email"].rule).toBe("erase");
    expect(UNUSED_ACCOUNT_RULES["TastingGroupMember.userId"].rule).toBe("unlink");
    expect(UNUSED_ACCOUNT_RULES["CoffeeShare.userId"].rule).toBe("erase");
    for (const k of ["CuppingSession.createdBy", "Evaluation.cupperId", "Coffee.createdBy", "TastingGroup.createdBy", "SessionParticipant.userId", "GroupPost.authorId", "AiChatUsage.userId"]) {
      expect(UNUSED_ACCOUNT_RULES[k].rule, k).toBe("blocks");
    }
  });
});

describe("planUnusedAccountDeletion", () => {
  const clean: ProfileFacts = { analyticsAccess: false, onboardingCompleted: false, role: "cupping_pro", hasCountry: false, hasBio: false, hasAvatar: false };

  it("an empty account is deletable with nothing to erase or unlink", () => {
    expect(planUnusedAccountDeletion(clean, {})).toEqual({ ok: true, erase: [], unlink: [] });
    expect(planUnusedAccountDeletion(null, { "WaitlistEntry.email": 0 })).toEqual({ ok: true, erase: [], unlink: [] });
  });
  it("erases its own reservation and ledgers, unlinks a group roster row", () => {
    const plan = planUnusedAccountDeletion(clean, {
      "WaitlistEntry.email": 1,
      "OutboundEmailEvent.actorKey": 2,
      "TastingGroupMember.userId": 1,
      "CoffeeShare.userId": 1,
    });
    expect(plan).toEqual({
      ok: true,
      erase: ["WaitlistEntry.email", "OutboundEmailEvent.actorKey", "CoffeeShare.userId"],
      unlink: ["TastingGroupMember.userId"],
    });
  });
  it("every blocking table, with a single row, stops the deletion", () => {
    for (const [key, r] of Object.entries(UNUSED_ACCOUNT_RULES)) {
      if (r.rule !== "blocks") continue;
      const plan = planUnusedAccountDeletion(clean, { [key]: 1, "WaitlistEntry.email": 1 });
      expect(plan, key).toEqual({ ok: false, usedBecause: [key] });
    }
  });
  it("a table nobody ruled on blocks (fail safe)", () => {
    expect(planUnusedAccountDeletion(clean, { "Brand.newTable": 1 })).toEqual({ ok: false, usedBecause: ["Brand.newTable"] });
  });
  it("each profile sign of use blocks", () => {
    for (const patch of [
      { analyticsAccess: true },
      { onboardingCompleted: true },
      { role: "roaster" },
      { hasCountry: true },
      { hasBio: true },
      { hasAvatar: true },
    ]) {
      const p = { ...clean, ...patch };
      expect(profileUsedReasons(p).length, JSON.stringify(patch)).toBe(1);
      expect(planUnusedAccountDeletion(p, {}).ok, JSON.stringify(patch)).toBe(false);
    }
  });
});
