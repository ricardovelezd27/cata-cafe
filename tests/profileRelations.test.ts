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

  it("every user-keyed bare column named like a user id is accounted for", () => {
    // A model with a plain `userId String` and no Profile relation is a bare
    // table; it must be in the manifest (CloseEmailDelivery, AiChatUsage).
    const bare: string[] = [];
    for (const [name, body] of MODELS) {
      if (name === "Profile") continue;
      const hasUserId = /^\s*userId\s+String\??\s*$/m.test(body);
      const hasRelation = relations.includes(manifestKey(name, "userId"));
      if (hasUserId && !hasRelation) bare.push(manifestKey(name, "userId"));
    }
    const missing = bare.filter((k) => !entries.has(k));
    expect(missing).toEqual([]);
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

describe("deleteAccount covers the manifest", () => {
  for (const e of PROFILE_MANIFEST) {
    if (e.onDelete === "keep") continue;
    const delegate = deletionDelegate(e);
    it(`${e.model}.${e.field} (${e.onDelete}) has a statement in deleteAccount`, () => {
      expect(delegate, `${e.model} needs a delegate (merge rule or deleteDelegate)`).not.toBeNull();
      if (e.onDelete === "erase") {
        expect(deleteSource).toContain(`tx.${delegate}.deleteMany(`);
      } else if (e.onDelete === "reassign-tombstone") {
        expect(deleteSource).toContain(`tx.${delegate}.updateMany(`);
      } else if (e.onDelete === "delete-if-solo-else-tombstone") {
        expect(deleteSource).toMatch(new RegExp(`tx\\.${delegate}\\.delete(Many)?\\(`));
        expect(deleteSource).toContain(`tx.${delegate}.updateMany(`);
      }
    });
  }

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

  it("removes the waitlist row by email (S8-08 TODO)", () => {
    expect(deleteSource).toMatch(/tx\.waitlistEntry\.deleteMany\(\{ where: \{ email: plan\.waitlistEmail \} \}\)/);
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
