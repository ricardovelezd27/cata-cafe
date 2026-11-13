// S10 WP7: private reflections (Kim F2) and the discreet entry after the
// interstitial (Kim F1). Pure rules and static scans only (no Prisma import).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFLECTION_MAX, parseReflectionInput } from "@/lib/warmup/reflections";
import { shouldOfferWarmupEntry, shouldShowWarmupOverlay } from "@/lib/warmup/overlayGate";
import { WARMUP_IDS } from "@/lib/warmup/exercises";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("parseReflectionInput", () => {
  it("accepts a known exercise with one or both answers, trimmed", () => {
    expect(parseReflectionInput({ exerciseId: "eyes", feel: "  tranquilo ", discovery: "" })).toEqual({
      exerciseId: "eyes",
      feel: "tranquilo",
      discovery: null,
    });
    expect(parseReflectionInput({ exerciseId: "arm-raise", feel: null, discovery: "mi mano" })).toEqual({
      exerciseId: "arm-raise",
      feel: null,
      discovery: "mi mano",
    });
    expect(parseReflectionInput({ exerciseId: "trunk-side", feel: "a", discovery: "b" }).discovery).toBe("b");
  });

  it("refuses an unknown exercise, no answer at all, a non-string and an over-long answer", () => {
    expect(() => parseReflectionInput({ exerciseId: "nope", feel: "x" })).toThrow("invalid_input");
    expect(() => parseReflectionInput({ exerciseId: "eyes", feel: "  ", discovery: "" })).toThrow("invalid_input");
    expect(() => parseReflectionInput({ exerciseId: "eyes" })).toThrow("invalid_input");
    expect(() => parseReflectionInput({ exerciseId: "eyes", feel: 3 })).toThrow("invalid_input");
    expect(() => parseReflectionInput({ exerciseId: "eyes", feel: "a".repeat(REFLECTION_MAX + 1) })).toThrow("invalid_input");
    expect(() => parseReflectionInput(null)).toThrow("invalid_input");
    expect(parseReflectionInput({ exerciseId: "eyes", feel: "a".repeat(REFLECTION_MAX) }).feel).toHaveLength(REFLECTION_MAX);
  });

  it("accepts every exercise id", () => {
    for (const id of WARMUP_IDS) expect(parseReflectionInput({ exerciseId: id, feel: "x" }).exerciseId).toBe(id);
  });
});

describe("warmup reflection actions (static scan)", () => {
  const src = read("app/actions/warmup.ts");
  const body = (name: string) => {
    const a = src.search(new RegExp(`^export async function ${name}\\b`, "m"));
    expect(a).toBeGreaterThan(-1);
    const rest = src.slice(a + 1);
    const n = rest.search(/^export /m);
    return n === -1 ? rest : rest.slice(0, n);
  };

  it("both actions are registered-only and return an ActionResult through run()", () => {
    for (const name of ["saveWarmupReflection", "deleteWarmupReflection"]) {
      const b = body(name);
      expect(b).toContain("requireRegisteredUser(");
      expect(b).not.toMatch(/\brequireUser\(/);
      expect(b).toContain(`run("${name}"`);
    }
  });

  it("the user id always comes from the session, never from the client", () => {
    expect(body("saveWarmupReflection")).toMatch(/saveReflectionCapped\(user\.id,/);
    expect(body("deleteWarmupReflection")).toMatch(/where:\s*\{\s*id:\s*rowId,\s*userId:\s*user\.id\s*\}/);
    expect(src).not.toMatch(/userId:\s*input\./);
  });

  it("exports only the two actions (every export of a use-server file is a public POST)", () => {
    expect([...src.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort()).toEqual([
      "deleteWarmupReflection",
      "saveWarmupReflection",
    ]);
  });
});

describe("nobody else reads warmup_reflections", () => {
  // The only files that may name the delegate: the two owner-scoped paths, the
  // account lifecycle (merge + deletion) and the model itself.
  const ALLOWED = new Set([
    "app/actions/warmup.ts",
    "lib/warmup/reflectionsData.ts",
    "lib/warmup/reflections.ts", // pure input rules; names the table in a comment only
    "lib/guestClaim.ts",
    "lib/accountDeletion/deleteAccount.ts",
    "lib/accountDeletion/manifest.ts",
    "lib/unusedAccountRules.ts", // names the table only: a row there means "the account was used" (an existence test, never content)
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(join(process.cwd(), dir))) {
      if (["node_modules", ".next", "generated", ".git", "tests", "docs", ".claude", "scripts"].includes(f)) continue;
      const rel = `${dir}/${f}`.replace(/^\.\//, "");
      const st = statSync(join(process.cwd(), rel));
      if (st.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(f)) out.push(rel);
    }
    return out;
  }

  it("only the owner-scoped code and the account lifecycle touch the table", () => {
    const hits = [...walk("app"), ...walk("lib"), ...walk("components"), ...walk("hooks")].filter((f) =>
      /\.warmupReflection(?![\w])|(?<![\w])warmup_reflections(?![\w])/.test(read(f)),
    );
    expect(hits.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it("the read helper always filters by the user id and the analytics/AI code never imports it", () => {
    expect(read("lib/warmup/reflectionsData.ts")).toMatch(/where:\s*\{\s*userId,\s*exerciseId\s*\}/);
    for (const f of [...walk("lib/analytics"), ...walk("lib/ai"), ...walk("lib/reports")]) {
      expect(read(f), f).not.toContain("reflectionsData");
    }
  });
});

describe("shouldOfferWarmupEntry (the discreet entry after the interstitial)", () => {
  const base = { exerciseId: "eyes", sessionClosed: false, overlayOpen: false, isOwner: false, isGroup: false, isAsync: false, startedAt: false };

  it("is offered when the session has an exercise, is not closed and the overlay is not open", () => {
    expect(shouldOfferWarmupEntry(base)).toBe(true);
  });

  it("is not offered without a (known) exercise", () => {
    expect(shouldOfferWarmupEntry({ ...base, exerciseId: null })).toBe(false);
    expect(shouldOfferWarmupEntry({ ...base, exerciseId: undefined })).toBe(false);
    expect(shouldOfferWarmupEntry({ ...base, exerciseId: "" })).toBe(false);
    expect(shouldOfferWarmupEntry({ ...base, exerciseId: "not-an-exercise" })).toBe(false);
  });

  it("is not offered on a closed session", () => {
    expect(shouldOfferWarmupEntry({ ...base, sessionClosed: true })).toBe(false);
  });

  it("is not offered while the interstitial itself is open", () => {
    expect(shouldOfferWarmupEntry({ ...base, overlayOpen: true })).toBe(false);
  });

  it("covers exactly the cases where the interstitial says no: started live group, returning cupper, seen", () => {
    const gate = { exerciseId: "eyes", seenValue: null, hasOwnEvaluation: false, isOwner: false, isGroup: true, isAsync: false, startedAt: true };
    // a live group already started: no interstitial, but the entry is there
    expect(shouldShowWarmupOverlay(gate)).toBe(false);
    expect(shouldOfferWarmupEntry({ ...base, isGroup: true, startedAt: true })).toBe(true);
    // returning mid-cupping (has an evaluation)
    expect(shouldShowWarmupOverlay({ ...gate, startedAt: false, hasOwnEvaluation: true })).toBe(false);
    expect(shouldOfferWarmupEntry({ ...base, isGroup: true })).toBe(true);
    // already seen
    expect(shouldShowWarmupOverlay({ ...gate, startedAt: false, seenValue: "eyes" })).toBe(false);
    // when the interstitial says yes, it is open, so no entry on top of it
    expect(shouldShowWarmupOverlay({ ...gate, startedAt: false })).toBe(true);
    expect(shouldOfferWarmupEntry({ ...base, overlayOpen: true })).toBe(false);
  });

  // TODO(kim-validar:F1): the master of a live group is not offered a private run before the start.
  it("truth table for the owner: not offered before the start of a LIVE group, offered everywhere else", () => {
    const rows: Array<[string, Partial<typeof base>, boolean]> = [
      ["live group, owner, not started", { isOwner: true, isGroup: true, isAsync: false, startedAt: false }, false],
      ["live group, owner, started", { isOwner: true, isGroup: true, isAsync: false, startedAt: true }, true],
      ["live group, participant, not started", { isOwner: false, isGroup: true, isAsync: false, startedAt: false }, true],
      ["async group, owner", { isOwner: true, isGroup: true, isAsync: true, startedAt: false }, true],
      ["solo, owner", { isOwner: true, isGroup: false, isAsync: false, startedAt: false }, true],
    ];
    for (const [name, patch, want] of rows) expect(shouldOfferWarmupEntry({ ...base, ...patch }), name).toBe(want);
  });
});

describe("the entry does not touch the seen-set", () => {
  it("WarmupEntry never marks a moment seen", () => {
    const src = read("components/session-moments/WarmupEntry.tsx");
    expect(src).not.toMatch(/markMomentSeen|useSessionMoment|dismiss\(/);
  });
});
