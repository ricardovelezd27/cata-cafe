import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_MANIFEST, deletionDelegate, manifestKey } from "../lib/accountDeletion/manifest";

// S8-07 (F-cuenta-1, F-guest-8): every user-referencing column is listed in
// the account-deletion manifest and, unless it says otherwise, handled by
// mergeGuestData. The test reads prisma/schema.prisma and the merge source as
// text (neither can be imported: Prisma and server-only).

const ROOT = process.cwd();
const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const mergeSource = readFileSync(join(ROOT, "lib", "guestClaim.ts"), "utf8");

/** model name -> body text */
function models(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) out.set(m[1], m[2]);
  return out;
}

const MODELS = models(schema);

/** Every `Model.fkField` whose relation targets Profile. */
function profileRelations(): string[] {
  const found: string[] = [];
  for (const [name, body] of MODELS) {
    if (name === "Profile") continue;
    for (const line of body.split("\n")) {
      const m = line.match(/^\s*\w+\s+Profile\??\s+@relation\(fields:\s*\[(\w+)\]/);
      if (m) found.push(manifestKey(name, m[1]));
    }
  }
  return found;
}

describe("account-deletion manifest vs schema.prisma", () => {
  const relations = profileRelations();
  const entries = new Map(PROFILE_MANIFEST.map((e) => [manifestKey(e.model, e.field), e]));

  it("finds the Profile relations (parser sanity)", () => {
    expect(relations.length).toBeGreaterThanOrEqual(14);
    expect(relations).toContain("Evaluation.cupperId");
  });

  it("lists every Profile relation, so a new user FK cannot be forgotten", () => {
    const missing = relations.filter((r) => !entries.has(r));
    expect(
      missing,
      `Add these to lib/accountDeletion/manifest.ts and to mergeGuestData (lib/guestClaim.ts): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no stale relation entries", () => {
    const stale = PROFILE_MANIFEST.filter((e) => e.kind === "relation")
      .map((e) => manifestKey(e.model, e.field))
      .filter((k) => !relations.includes(k));
    expect(stale).toEqual([]);
  });

  it("every listed column exists in the schema", () => {
    for (const e of PROFILE_MANIFEST) {
      const body = MODELS.get(e.model);
      expect(body, `model ${e.model}`).toBeDefined();
      expect(body, `${e.model}.${e.field}`).toMatch(new RegExp(`^\\s*${e.field}\\s`, "m"));
    }
  });

  it("every column named like a known user-id column is accounted for", () => {
    // The user-id column names the manifest already uses (userId, createdBy,
    // cupperId, evaluatedBy, revealedBy, authorId, excludedBy, actorKey…).
    // Any String column with one of these names, in any model, with or
    // without a Profile relation, must be in the manifest: a new
    // `excludedBy`-style bare column cannot slip past.
    const names = new Set(
      PROFILE_MANIFEST.filter((e) => e.field !== "email").map((e) => e.field),
    );
    expect(names.size).toBeGreaterThanOrEqual(8);
    const found: string[] = [];
    for (const [name, body] of MODELS) {
      if (name === "Profile") continue;
      for (const line of body.split("\n")) {
        const m = line.match(/^\s*(\w+)\s+String\??(\s|$)/);
        if (m && names.has(m[1])) found.push(manifestKey(name, m[1]));
      }
    }
    expect(found).toContain("SessionParticipant.excludedBy");
    const missing = found.filter((k) => !entries.has(k));
    expect(missing, `Add to lib/accountDeletion/manifest.ts: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("mergeGuestData covers the manifest", () => {
  for (const e of PROFILE_MANIFEST) {
    if (e.merge.kind === "not-applicable") continue;
    const needle = `tx.${e.merge.delegate}.`;
    it(`${e.model}.${e.field} is handled by ${needle}`, () => {
      expect(mergeSource).toContain(needle);
    });
  }

  it("every not-applicable merge rule says why", () => {
    for (const e of PROFILE_MANIFEST) {
      if (e.merge.kind === "not-applicable") expect(e.merge.reason.length).toBeGreaterThan(5);
    }
  });

  it("deletes the guest's profile last so a forgotten FK rolls the merge back", () => {
    expect(mergeSource).toContain("tx.profile.delete");
  });
});

// S8-19: deleteAccount follows the manifest rule by rule. Same source-scan
// style (the module imports Prisma and server-only).
const deleteSource = readFileSync(
  join(ROOT, "lib", "accountDeletion", "deleteAccount.ts"),
  "utf8",
);

/** Every `tx.<delegate>.<method>({ … });` statement, with its where text. */
function statements(delegate: string, methods: string[]): { method: string; where: string }[] {
  const re = new RegExp(`tx\\.${delegate}\\.(${methods.join("|")})\\((\\{[\\s\\S]*?\\})\\);`, "g");
  return [...deleteSource.matchAll(re)].map((m) => {
    const body = m[2];
    const w = body.indexOf("where:");
    const d = body.indexOf("data:");
    return { method: m[1], where: w < 0 ? "" : body.slice(w, d > w ? d : undefined) };
  });
}

/** The where filters by the user: `<field>: userId` (or `u_${userId}`). */
function filtersByUser(where: string, field: string): boolean {
  if (new RegExp(`\\b${field}\\s*:\\s*(userId\\b|\`u_\\$\\{userId\\}\`)`).test(where)) return true;
  // Shorthand `{ userId }` when the column is literally userId.
  return field === "userId" && /[{,]\s*userId\s*[,}]/.test(where);
}

/** Id-list deletes the test accepts instead of a user filter, by model: the
 *  variable must be one deleteAccount builds from the user's own rows. */
const ID_LIST_VARS: Record<string, string[]> = {
  CuppingSession: ["sessionId"], // loop over inner.deleteSessionIds
  TastingGroupMember: ["memberIds"], // exactEmailMatches over the user's address
  WaitlistEntry: ["waitlistIds"], // exactEmailMatches over the user's address
};

function filtersByIdList(where: string, model: string): boolean {
  return (ID_LIST_VARS[model] ?? []).some((v) =>
    new RegExp(`\\bid\\s*:\\s*(\\{\\s*in\\s*:\\s*${v}\\s*\\}|${v}\\b)`).test(where),
  );
}

describe("deleteAccount covers the manifest", () => {
  for (const e of PROFILE_MANIFEST) {
    if (e.onDelete === "keep") continue;
    const delegate = deletionDelegate(e);
    it(`${e.model}.${e.field} (${e.onDelete}) has a user-filtered statement in deleteAccount`, () => {
      expect(delegate, `${e.model} needs a delegate (merge rule or deleteDelegate)`).not.toBeNull();
      const ok = (s: { where: string }) =>
        filtersByUser(s.where, e.field) || filtersByIdList(s.where, e.model);
      if (e.onDelete === "erase") {
        const st = statements(delegate!, ["deleteMany"]);
        expect(st.some(ok), `tx.${delegate}.deleteMany filtered by ${e.field}`).toBe(true);
      } else if (e.onDelete === "reassign-tombstone") {
        const st = statements(delegate!, ["updateMany"]);
        expect(st.some((s) => filtersByUser(s.where, e.field)), `tx.${delegate}.updateMany by ${e.field}`).toBe(
          true,
        );
      } else if (e.onDelete === "delete-if-solo-else-tombstone") {
        const del = statements(delegate!, ["delete", "deleteMany"]);
        expect(del.some(ok), `tx.${delegate}.delete(Many) by ${e.field} or a planned id`).toBe(true);
        const upd = statements(delegate!, ["updateMany"]);
        expect(upd.some((s) => filtersByUser(s.where, e.field)), `tx.${delegate}.updateMany by ${e.field}`).toBe(
          true,
        );
      }
    });
  }

  it("the statement scanner rejects a statement that lost its user filter", () => {
    expect(filtersByUser("where: { cupperId: userId }", "cupperId")).toBe(true);
    expect(filtersByUser("where: { actorKey: `u_${userId}` }", "actorKey")).toBe(true);
    expect(filtersByUser("where: { userId } }", "userId")).toBe(true);
    expect(filtersByUser("where: { userId } }", "createdBy")).toBe(false);
    expect(filtersByUser("where: {}", "cupperId")).toBe(false);
    expect(filtersByUser("where: { cupperId: placeholderId }", "cupperId")).toBe(false);
    expect(filtersByIdList("where: { id: { in: memberIds } }", "TastingGroupMember")).toBe(true);
    expect(filtersByIdList("where: { id: { in: someIds } }", "TastingGroupMember")).toBe(false);
  });

  it("reassigns to a fresh placeholder, never a shared tombstone", () => {
    expect(deleteSource).toContain("deletedProfileId(randomUUID())");
    expect(deleteSource).toContain("tx.profile.create(");
  });

  it("closes the live sessions it keeps before the transaction", () => {
    expect(deleteSource).toMatch(/closeSessionInternal\([^)]*reason: "owner_deleted"/);
  });

  it("deletes own sessions through the deleteSession path", () => {
    expect(deleteSource).toContain("detachCoffeeHistoryForSession(tx, sessionId)");
  });

  it("anonymizes coffees with the deleteCoffees routine", () => {
    expect(deleteSource).toContain("anonymizeOwnedCoffees(tx, userId)");
  });

  it("does not put isDraft in the evaluation SET (the trigger must not re-fire)", () => {
    const evalUpdate = deleteSource.match(/tx\.evaluation\.updateMany\(\{[\s\S]*?\}\);/);
    expect(evalUpdate).not.toBeNull();
    expect(evalUpdate![0]).not.toContain("isDraft");
  });

  it("removes the waitlist row by email (S8-08 TODO), matched exactly in JS", () => {
    expect(deleteSource).toMatch(/exactEmailMatches\(waitlistCandidates, plan\.waitlistEmail\)/);
    expect(deleteSource).toMatch(/tx\.waitlistEntry\.deleteMany\(\{ where: \{ id: \{ in: waitlistIds \} \} \}\)/);
  });

  it("never deletes by a database email match (ILIKE wildcards)", () => {
    // Every `email:` filter in the file is a candidate SELECT, never a delete.
    for (const m of deleteSource.matchAll(/tx\.(\w+)\.(deleteMany|updateMany)\(\{[\s\S]*?\}\);/g)) {
      expect(m[0], m[0]).not.toMatch(/\bemail\s*:/);
    }
    expect(deleteSource).toMatch(/exactEmailMatches\(memberCandidates, plan\.waitlistEmail\)/);
  });

  it("deletes the profile LAST and never catches it", () => {
    const last = deleteSource.lastIndexOf("tx.profile.delete(");
    expect(last).toBeGreaterThan(-1);
    const txEnd = deleteSource.indexOf("}, TX_OPTIONS);");
    expect(txEnd).toBeGreaterThan(last);
    const between = deleteSource.slice(last, txEnd);
    expect(between).not.toMatch(/\btx\.(?!profile\.delete)/);
    expect(between).not.toContain("catch");
  });
});
