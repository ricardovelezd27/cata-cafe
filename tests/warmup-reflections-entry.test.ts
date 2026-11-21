// S10 WP7: private reflections (Kim F2). Pure rules and static scans only (no Prisma import).
import { describe, expect, it } from "vitest";
import { REFLECTION_MAX, parseReflectionInput } from "@/lib/warmup/reflections";
import { WARMUP_IDS } from "@/lib/warmup/exercises";
import { SCAN_TIMEOUT_MS, readSource, walkSource } from "./helpers/sourceTree";

const read = (p: string) => readSource(p).replace(/\r\n/g, "\n");

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

  const SKIP = ["node_modules", ".next", "generated", ".git", "tests", "docs", ".claude", "scripts"];
  const walk = (dir: string) =>
    walkSource(dir, "warmup-reflections-entry", { skip: (name) => SKIP.includes(name), include: /\.(ts|tsx)$/ });

  it("only the owner-scoped code and the account lifecycle touch the table", () => {
    const hits = [...walk("app"), ...walk("lib"), ...walk("components"), ...walk("hooks")].filter((f) =>
      /\.warmupReflection(?![\w])|(?<![\w])warmup_reflections(?![\w])/.test(read(f)),
    );
    expect(hits.filter((f) => !ALLOWED.has(f))).toEqual([]);
  }, SCAN_TIMEOUT_MS); // reads every source file: a full run slows that about tenfold

  it("the read helper always filters by the user id and the analytics/AI code never imports it", () => {
    expect(read("lib/warmup/reflectionsData.ts")).toMatch(/where:\s*\{\s*userId,\s*exerciseId\s*\}/);
    for (const f of [...walk("lib/analytics"), ...walk("lib/ai"), ...walk("lib/reports")]) {
      expect(read(f), f).not.toContain("reflectionsData");
    }
  }, SCAN_TIMEOUT_MS); // walks three source folders
});

