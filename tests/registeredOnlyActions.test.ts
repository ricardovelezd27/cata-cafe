import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S8-03: proxy.ts only gates PAGES; a server action is a public POST endpoint.
// Every action that creates an asset, shares, invites or sends email must call
// requireRegisteredUser() (lib/auth.ts), and the actions guests legitimately
// use must keep requireUser(). Static scan (no Prisma import).

const ACTIONS = join(process.cwd(), "app", "actions");

function read(file: string): string {
  return readFileSync(join(ACTIONS, file), "utf8");
}

/** Body of `export async function NAME(` up to the next top-level `export `. */
function bodyOf(src: string, name: string): string | null {
  const start = src.search(new RegExp(`^export async function ${name}\\b`, "m"));
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/^export /m);
  return next === -1 ? rest : rest.slice(0, next);
}

function exportsOf(src: string): string[] {
  return [...src.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
}

const REGISTERED: Record<string, string[]> = {
  "sessions.ts": ["createSession", "createExpressSession", "createGroupSession", "duplicateSession", "assignSampleCoffee"],
  "community.ts": ["createInviteToken"],
};

// coffees.ts and groups.ts: EVERY export is registered-only, so a new export
// is guarded by default.
const ALL_REGISTERED_FILES = ["coffees.ts", "groups.ts"];

const GUEST_KEEPS: Record<string, string[]> = {
  "sessions.ts": ["upsertEvaluation", "checkSessionStarted", "getWaitingState"],
  "community.ts": ["joinViaToken", "completeGuestOnboarding", "submitAllEvaluations"],
};

describe("registered-only server actions", () => {
  for (const [file, names] of Object.entries(REGISTERED)) {
    for (const name of names) {
      it(`${file} ${name} requires a registered user`, () => {
        const body = bodyOf(read(file), name);
        expect(body, `${name} not found`).not.toBeNull();
        expect(body).toContain("requireRegisteredUser(");
        expect(body).not.toMatch(/\brequireUser\(/);
      });
    }
  }

  for (const file of ALL_REGISTERED_FILES) {
    const src = read(file);
    const names = exportsOf(src);
    it(`${file} exports at least one action`, () => {
      expect(names.length).toBeGreaterThan(5);
    });
    for (const name of names) {
      it(`${file} ${name} requires a registered user`, () => {
        const body = bodyOf(src, name)!;
        // deleteCoffee delegates to deleteCoffees, which holds the guard.
        if (name === "deleteCoffee") {
          expect(body).toMatch(/deleteCoffees\(/);
          return;
        }
        expect(body).toContain("requireRegisteredUser(");
        expect(body).not.toMatch(/\brequireUser\(/);
      });
    }
  }

  for (const [file, names] of Object.entries(GUEST_KEEPS)) {
    for (const name of names) {
      it(`${file} ${name} stays open to guests`, () => {
        const body = bodyOf(read(file), name);
        expect(body, `${name} not found`).not.toBeNull();
        expect(body).toContain("requireUser(");
        expect(body).not.toContain("requireRegisteredUser(");
      });
    }
  }
});
