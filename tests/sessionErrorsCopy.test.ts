import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import es from "../messages/es.json";
import en from "../messages/en.json";
import { safeLocale } from "../lib/safeLocale";

// S8-10 T2: every error code the create wizard can return must have es/en
// copy in session.newForm.errors (a missing key silently fell back to
// "generic" before). Static scan of the validators — no Prisma import.

const root = process.cwd();
const sessionsSrc = readFileSync(join(root, "app", "actions", "sessions.ts"), "utf8");
const boundsSrc = readFileSync(join(root, "lib", "coffeeInputBounds.ts"), "utf8");

function wizardCodes(): string[] {
  const codes = new Set<string>();
  // validateSessionInput: `return "code"`
  const start = sessionsSrc.indexOf("function validateSessionInput");
  const end = sessionsSrc.indexOf("const SESSION_FORMATS");
  for (const m of sessionsSrc.slice(start, end).matchAll(/return "([a-z_]+)"/g)) codes.add(m[1]);
  // validateSessionMeta: `field("code", …)`
  for (const m of sessionsSrc.matchAll(/field\(\s*"([a-z_]+)"/g)) codes.add(m[1]);
  // coffeeInputBounds
  for (const m of boundsSrc.matchAll(/return "([a-z_]+)"/g)) codes.add(m[1]);
  // wizard bodies' own literal errors
  for (const m of sessionsSrc.matchAll(/error: "([a-z_]+)"/g)) {
    if (["session_closed", "sample_has_evaluations", "format_locked", "warmup_locked", "not_group_session", "invalid_label", "coffee_not_found", "identity_changed", "sample_revealed"].includes(m[1])) continue;
    codes.add(m[1]);
  }
  return [...codes];
}

describe("wizard error copy", () => {
  const codes = wizardCodes();
  it("finds the validators' codes", () => {
    expect(codes).toContain("no_samples");
    expect(codes).toContain("invalid_warmup");
    expect(codes).toContain("too_many_coffees");
  });
  for (const [name, msgs] of [["es", es], ["en", en]] as const) {
    it(`${name}: every code has copy`, () => {
      const table = msgs.session.newForm.errors as Record<string, string>;
      const missing = codes.filter((c) => !table[c]);
      expect(missing).toEqual([]);
    });
  }
  it("covers the thrown codes run() can hand the wizard", () => {
    for (const msgs of [es, en]) {
      const table = msgs.session.newForm.errors as Record<string, string>;
      for (const c of ["unknown", "not_authenticated", "not_found_or_forbidden", "generic"]) {
        expect(table[c]).toBeTruthy();
      }
    }
  });
});

describe("safeLocale", () => {
  it("only lets the app's locales through", () => {
    expect(safeLocale("en")).toBe("en");
    expect(safeLocale("es")).toBe("es");
    expect(safeLocale("//evil.test")).toBe("es");
    expect(safeLocale(undefined)).toBe("es");
    expect(safeLocale("../x")).toBe("es");
  });
});
