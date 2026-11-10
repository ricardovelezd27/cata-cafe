import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deleteConfirmationWord,
  exactEmailMatches,
  impactOf,
  isDeleteConfirmed,
  planAccountDeletion,
  plansEqual,
  type DeletionFixture,
} from "@/lib/accountDeletion/plan";
import {
  DELETED_PROFILE_PREFIX,
  deletedProfileId,
  deletedProfileLabel,
  isDeletedProfileId,
  profileDisplayName,
} from "@/lib/accountDeletion/deletedProfile";

// S8-19 (F-cuenta-1): the per-relation plan deleteAccount follows, over a
// fixture. The transaction itself imports Prisma and is covered by the source
// scan in tests/profileRelations.test.ts.

function fixture(over: Partial<DeletionFixture> = {}): DeletionFixture {
  return {
    userId: "u1",
    email: "Ana@Example.com",
    isAnonymous: false,
    isSuperAdmin: false,
    ownedSessions: [],
    participations: [],
    evaluationSessionIds: [],
    ownedGroups: [],
    liveOwnedCoffees: 0,
    ...over,
  };
}

function okPlan(f: DeletionFixture) {
  const p = planAccountDeletion(f);
  if (!p.ok) throw new Error("expected an ok plan");
  return p;
}

describe("planAccountDeletion", () => {
  it("deletes a solo session (and the evaluations in it)", () => {
    const p = okPlan(
      fixture({
        ownedSessions: [{ id: "solo", isGroup: false, status: "closed", otherCupperEvaluations: 0, otherJoinedParticipants: 0 }],
        participations: [{ sessionId: "solo", excludedFromResults: false }],
        evaluationSessionIds: ["solo", "solo"],
      }),
    );
    expect(p.deleteSessionIds).toEqual(["solo"]);
    expect(p.keepSessionIds).toEqual([]);
    expect(p.closeBeforeDelete).toEqual([]);
    expect(p.reassignParticipations).toEqual([]);
    expect(p.evaluationsDeleted).toBe(2);
    expect(p.evaluationsAnonymized).toBe(0);
  });

  it("deletes a group session nobody else evaluated in or joined (invited-only rows do not count)", () => {
    const p = okPlan(
      fixture({
        ownedSessions: [{ id: "g0", isGroup: true, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 0 }],
      }),
    );
    expect(p.deleteSessionIds).toEqual(["g0"]);
    expect(p.closeBeforeDelete).toEqual([]);
  });

  it("keeps a group session others JOINED but nobody evaluated yet, closing it first", () => {
    const p = okPlan(
      fixture({
        ownedSessions: [
          { id: "waiting", isGroup: true, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 2 },
        ],
      }),
    );
    expect(p.deleteSessionIds).toEqual([]);
    expect(p.keepSessionIds).toEqual(["waiting"]);
    expect(p.closeBeforeDelete).toEqual(["waiting"]);
    expect(impactOf(p).sessionsKept).toBe(1);
  });

  it("the loader counts other participants except invited-only rows", () => {
    const src = readFileSync(join(process.cwd(), "lib", "accountDeletion", "load.ts"), "utf8");
    expect(src).toMatch(
      /sessionParticipant\.groupBy\(\{[\s\S]*?userId: \{ not: userId \}, status: \{ not: "invited" \}/,
    );
  });

  it("deletes a solo session regardless of the participant counts", () => {
    const p = okPlan(
      fixture({
        ownedSessions: [
          { id: "solo", isGroup: false, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 0 },
        ],
      }),
    );
    expect(p.deleteSessionIds).toEqual(["solo"]);
    expect(p.keepSessionIds).toEqual([]);
  });

  it("keeps a shared session, closes it first when live, and reassigns the owner's rows", () => {
    const p = okPlan(
      fixture({
        ownedSessions: [
          { id: "live", isGroup: true, status: "active", otherCupperEvaluations: 3, otherJoinedParticipants: 0 },
          { id: "done", isGroup: true, status: "closed", otherCupperEvaluations: 5, otherJoinedParticipants: 0 },
        ],
        participations: [
          { sessionId: "live", excludedFromResults: false },
          { sessionId: "done", excludedFromResults: false },
        ],
        evaluationSessionIds: ["live", "done", "done"],
      }),
    );
    expect(p.keepSessionIds).toEqual(["live", "done"]);
    expect(p.deleteSessionIds).toEqual([]);
    expect(p.closeBeforeDelete).toEqual(["live"]);
    expect(p.reassignParticipations.map((r) => r.sessionId)).toEqual(["live", "done"]);
    expect(p.evaluationsAnonymized).toBe(3);
  });

  it("an excluded participant keeps the flag when reassigned", () => {
    const p = okPlan(
      fixture({
        participations: [
          { sessionId: "someone-else", excludedFromResults: true },
          { sessionId: "other", excludedFromResults: false },
        ],
        evaluationSessionIds: ["someone-else"],
      }),
    );
    expect(p.reassignParticipations).toEqual([
      { sessionId: "someone-else", excludedFromResults: true },
      { sessionId: "other", excludedFromResults: false },
    ]);
    expect(p.evaluationsAnonymized).toBe(1);
  });

  it("deletes an empty group and keeps one with other members", () => {
    const p = okPlan(
      fixture({
        ownedGroups: [
          { id: "empty", otherMembers: 0 },
          { id: "busy", otherMembers: 4 },
        ],
      }),
    );
    expect(p.deleteGroupIds).toEqual(["empty"]);
    expect(p.keepGroupIds).toEqual(["busy"]);
  });

  it("refuses the super-admin account", () => {
    const p = planAccountDeletion(fixture({ isSuperAdmin: true, ownedSessions: [] }));
    expect(p).toEqual({ ok: false, refused: "super_admin" });
    expect(impactOf(p).protected).toBe(true);
  });

  it("allows a guest (no email, no waitlist row)", () => {
    const p = okPlan(
      fixture({
        email: null,
        isAnonymous: true,
        participations: [{ sessionId: "s", excludedFromResults: false }],
        evaluationSessionIds: ["s"],
      }),
    );
    expect(p.waitlistEmail).toBeNull();
    expect(p.evaluationsAnonymized).toBe(1);
  });

  it("removes the waitlist row by lowercased email (S8-08 left this to S8-07)", () => {
    expect(okPlan(fixture({ email: "  Ana@Example.com " })).waitlistEmail).toBe("ana@example.com");
  });

  it("impact counts match the plan", () => {
    const p = planAccountDeletion(
      fixture({
        ownedSessions: [
          { id: "a", isGroup: false, status: "closed", otherCupperEvaluations: 0, otherJoinedParticipants: 0 },
          { id: "b", isGroup: true, status: "closed", otherCupperEvaluations: 2, otherJoinedParticipants: 0 },
        ],
        ownedGroups: [{ id: "g", otherMembers: 1 }],
        liveOwnedCoffees: 3,
        evaluationSessionIds: ["a", "b", "x"],
      }),
    );
    expect(impactOf(p)).toEqual({
      sessionsDeleted: 1,
      sessionsKept: 1,
      coffeesAnonymized: 3,
      groupsDeleted: 0,
      groupsKept: 1,
      evaluationsAnonymized: 2,
      protected: false,
    });
  });
});

describe("plansEqual (re-plan inside the transaction)", () => {
  const base = fixture({
    ownedSessions: [
      { id: "a", isGroup: false, status: "closed", otherCupperEvaluations: 0, otherJoinedParticipants: 0 },
      { id: "b", isGroup: true, status: "closed", otherCupperEvaluations: 2, otherJoinedParticipants: 2 },
    ],
    ownedGroups: [
      { id: "g1", otherMembers: 0 },
      { id: "g2", otherMembers: 3 },
    ],
  });

  it("same ids in any order are equal", () => {
    const reordered = fixture({
      ...base,
      ownedSessions: [...base.ownedSessions].reverse(),
      ownedGroups: [...base.ownedGroups].reverse(),
    });
    expect(plansEqual(planAccountDeletion(base), planAccountDeletion(reordered))).toBe(true);
  });

  it("a session created after the first read differs", () => {
    const later = fixture({
      ...base,
      ownedSessions: [
        ...base.ownedSessions,
        { id: "new", isGroup: true, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 1 },
      ],
    });
    expect(plansEqual(planAccountDeletion(base), planAccountDeletion(later))).toBe(false);
  });

  it("someone joining a to-be-deleted group session differs (deleted -> kept)", () => {
    const g = fixture({
      ownedSessions: [
        { id: "w", isGroup: true, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 0 },
      ],
    });
    const joined = fixture({
      ownedSessions: [
        { id: "w", isGroup: true, status: "active", otherCupperEvaluations: 0, otherJoinedParticipants: 1 },
      ],
    });
    expect(plansEqual(planAccountDeletion(g), planAccountDeletion(joined))).toBe(false);
  });

  it("a member added to an empty group differs (deleted -> kept)", () => {
    const grown = fixture({ ...base, ownedGroups: [{ id: "g1", otherMembers: 1 }, base.ownedGroups[1]] });
    expect(plansEqual(planAccountDeletion(base), planAccountDeletion(grown))).toBe(false);
  });

  it("deleteAccount re-plans inside the transaction and throws conflict on a difference", () => {
    const src = readFileSync(join(process.cwd(), "lib", "accountDeletion", "deleteAccount.ts"), "utf8");
    expect(src).toContain("planAccountDeletion(await loadDeletionFixture(user, tx))");
    expect(src).toMatch(/!plansEqual\(plan, inner\)[\s\S]{0,80}throw new Error\("conflict"\)/);
  });
});

describe("exactEmailMatches (no ILIKE wildcards)", () => {
  const rows = [
    { id: "1", email: "john_doe@x.com" },
    { id: "2", email: "johnXdoe@x.com" },
    { id: "3", email: "  JOHN_DOE@X.COM " },
    { id: "4", email: "ana%b@x.com" },
    { id: "5", email: "anaZZb@x.com" },
    { id: "6", email: "ana@x.com" },
  ];

  it("`_` is a literal, not a one-character wildcard", () => {
    expect(exactEmailMatches(rows, "John_Doe@x.com").map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("`%` is a literal, not a many-character wildcard", () => {
    expect(exactEmailMatches(rows, "ana%b@x.com").map((r) => r.id)).toEqual(["4"]);
    expect(exactEmailMatches(rows, "ana%@x.com")).toEqual([]);
  });

  it("matches case- and whitespace-insensitively, never a prefix or substring", () => {
    expect(exactEmailMatches(rows, " ANA@X.COM").map((r) => r.id)).toEqual(["6"]);
    expect(exactEmailMatches(rows, "na@x.com")).toEqual([]);
  });

  it("no address matches nothing", () => {
    expect(exactEmailMatches(rows, null)).toEqual([]);
    expect(exactEmailMatches(rows, "   ")).toEqual([]);
  });
});

describe("typed confirmation", () => {
  it("needs the locale's word", () => {
    expect(deleteConfirmationWord("es")).toBe("ELIMINAR");
    expect(deleteConfirmationWord("en")).toBe("DELETE");
    expect(isDeleteConfirmed("eliminar ", "es")).toBe(true);
    expect(isDeleteConfirmed("DELETE", "es")).toBe(false);
    expect(isDeleteConfirmed("DELETE", "en")).toBe(true);
    expect(isDeleteConfirmed(undefined, "en")).toBe(false);
  });
});

describe("deleted profile placeholder", () => {
  it("builds and recognizes ids", () => {
    const id = deletedProfileId("0f8e2c1a-9b7d-4e3f-a1b2-c3d4e5f60718");
    expect(id.startsWith(DELETED_PROFILE_PREFIX)).toBe(true);
    expect(id).toBe("deleted_0f8e2c1a9b7d4e3fa1b2c3d4e5f60718");
    expect(isDeletedProfileId(id)).toBe(true);
    expect(isDeletedProfileId("0f8e2c1a-9b7d-4e3f-a1b2-c3d4e5f60718")).toBe(false);
    expect(isDeletedProfileId(null)).toBe(false);
    expect(() => deletedProfileId("short")).toThrow();
  });

  it("renders a localized label for the placeholder only", () => {
    expect(deletedProfileLabel("en")).toBe("Deleted account");
    expect(deletedProfileLabel("es")).toBe("Cuenta eliminada");
    expect(profileDisplayName({ id: "deleted_abcdefabcdefabcdef", displayName: "x" }, "en")).toBe(
      "Deleted account",
    );
    expect(profileDisplayName({ id: "u1", displayName: "Ana" }, "en")).toBe("Ana");
    expect(profileDisplayName(null, "en", "—")).toBe("—");
  });
});
