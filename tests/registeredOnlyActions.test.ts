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

// sessions.ts, community.ts (S8-21) and account.ts (S8-19): EVERY export must either call
// requireRegisteredUser( or be listed below with the reason it is allowed to
// keep requireUser(). A new creator/sender is therefore guarded by default.
//
// GUEST_ALLOWED: guests (anonymous QR walk-ups) legitimately call these; each
// is gated as a session member (or is a pure read for one).
const GUEST_ALLOWED: Record<string, Record<string, string>> = {
  "sessions.ts": {
    upsertEvaluation: "cups as a member (requireSampleMember); guests evaluate",
    checkSessionStarted: "waiting room, member read; guests wait too",
    getWaitingState: "waiting room, member read; guests wait too",
  },
  "community.ts": {
    submitAllEvaluations: "member submit; guests submit their evaluations",
    joinViaToken: "invite join, the entry point for guests",
    completeGuestOnboarding: "guest onboarding after a QR join",
  },
  // S8-19: both exports act on the signed-in user's OWN account only, never
  // an id from the client.
  "account.ts": {
    deleteAccount: "a guest may delete their own account (spec S8-07, Apple 5.1.1(v))",
    getMyAccountDeletionImpact: "counts for that same self-delete dialog; guests see it too",
  },
};

// OWNER_ONLY: mutate or read an asset that only its creator can reach. A guest
// can never create a session (every creator is registered-only above), so they
// cannot own one; the owner gate (requireSessionOwner / requireSampleOwner)
// is the real check and must be present in the body. None of these creates an
// asset or sends mail on behalf of a non-owner.
const OWNER_ONLY: Record<string, string[]> = {
  "sessions.ts": [
    "getDeleteImpact", "deleteSession", "setReferenceSample", "updateSession", "addSessionSample",
    "renameSessionSample", "removeSessionSample", "upsertPhysical", "upsertExtrinsic",
  ],
  "community.ts": [
    "finishSoloSession", "startSession", "startWarmup", "stopWarmup", "getCloseImpact", "closeSession",
    "resendCloseEmails", "revealSample", "setParticipantExclusion", "refreshAggregateScores",
  ],
};

// coffees.ts and groups.ts (see below): every export is registered-only.
const ALL_REGISTERED_FILES = ["coffees.ts", "groups.ts"];

describe("registered-only server actions", () => {
  for (const file of ["sessions.ts", "community.ts", "account.ts"]) {
    const src = read(file);
    const allowed = GUEST_ALLOWED[file] ?? {};
    const ownerOnly = OWNER_ONLY[file] ?? [];
    for (const name of exportsOf(src)) {
      it(`${file} ${name} is registered-only or explicitly allowlisted`, () => {
        const body = bodyOf(src, name)!;
        if (name in allowed) {
          // requireUserExpecting is requireUser plus the optional shared-device guard (S10 WP8).
          expect(body).toMatch(/requireUser\(|requireUserExpecting\(/);
          expect(body).not.toContain("requireRegisteredUser(");
        } else if (ownerOnly.includes(name)) {
          expect(body).toMatch(/requireSessionOwner\(|requireSampleOwner\(/);
          expect(body).not.toContain("requireRegisteredUser(");
        } else {
          expect(body).toContain("requireRegisteredUser(");
          expect(body).not.toMatch(/\brequireUser\(/);
        }
      });
    }
    it(`${file} allowlists name only real exports`, () => {
      const names = new Set(exportsOf(src));
      for (const n of [...Object.keys(allowed), ...ownerOnly]) expect(names.has(n), n).toBe(true);
    });
  }

  // coffees.ts and groups.ts: EVERY export is registered-only, so a new export
  // is guarded by default.
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
});
