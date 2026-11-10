import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_MANIFEST, manifestKey } from "../lib/accountDeletion/manifest";

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
