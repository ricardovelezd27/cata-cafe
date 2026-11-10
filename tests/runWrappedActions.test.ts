import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Interactive actions must return an ActionResult via run() so a thrown error
// never reaches the browser as an opaque digest (CLAUDE.md "Server Action
// Contract"). Pins the S8-10 conversions.
const WRAPPED: Record<string, string[]> = {
  "coffees.ts": ["duplicateCoffee", "createCoffee", "updateCoffee"],
  "sessions.ts": ["assignSampleCoffee", "createExpressSession"],
  "account.ts": ["deleteAccount", "getMyAccountDeletionImpact"],
};

function bodyOf(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport async function ", start + 10);
  return source.slice(start, next === -1 ? source.length : next);
}

describe("run()-wrapped interactive actions", () => {
  for (const [file, names] of Object.entries(WRAPPED)) {
    const source = fs.readFileSync(path.join(process.cwd(), "app", "actions", file), "utf8");
    for (const name of names) {
      it(`${file}#${name} goes through run()`, () => {
        expect(bodyOf(source, name)).toMatch(/\brun\(\s*"/);
      });
    }
  }
});
