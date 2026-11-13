/**
 * S10 WP4a review M3 (Kim C5). The group-visibility rule has ONE call site,
 * `viewerMayReadGroupResults` (lib/sessionState.ts), which builds the argument
 * of `canViewGroupResults` from the session row. The results page and the
 * participant-summary route must go through it, and nothing outside
 * lib/sessionState.ts may call `canViewGroupResults` directly, so neither can
 * pass an "everyone has submitted" flag again.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { viewerMayReadGroupResults } from "@/lib/sessionState";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the group-visibility call site", () => {
  const PAGE = "app/[locale]/app/sessions/[id]/results/page.tsx";
  const ROUTE = "app/api/sessions/[id]/participant-summary/route.ts";

  it("the results page and the participant-summary route call viewerMayReadGroupResults", () => {
    for (const f of [PAGE, ROUTE]) {
      expect(stripComments(read(f)), f).toMatch(/viewerMayReadGroupResults\(/);
    }
  });

  it("only lib/sessionState.ts calls canViewGroupResults directly", () => {
    const offenders = [...walk("app"), ...walk("lib"), ...walk("components")].filter((f) => {
      if (f === "lib/sessionState.ts") return false;
      return /\bcanViewGroupResults\s*\(/.test(stripComments(read(f)));
    });
    expect(offenders).toEqual([]);
  });

  it("the results page does not derive an all-submitted flag for the group gate", () => {
    const page = stripComments(read(PAGE));
    expect(page).not.toMatch(/\ballSubmitted\s*[:,=]\s*(?!.*myProgress)/);
    expect(page).not.toMatch(/submittedCupperCount\s*>=\s*totalParticipants/);
  });

  // Second review L6b: no expression outside the seam may compare the submitted-cuppers
  // count with the participants total, in either order and with any operator.
  const CMP = /(?:<=|>=|===|!==|==|!=|(?<![=\-])<(?!=)|(?<![=\-])>(?!=))/;
  const COMPARES_BOTH = (src: string) =>
    src.split(/[;\n]/).some((l) => {
      const a = l.search(/submittedCupperCount|submittedCount/);
      const b = l.search(/totalParticipants|participants\.length|participantCount/);
      return a !== -1 && b !== -1 && CMP.test(l);
    });

  it("the comparison scan catches both operand orders and every operator (sanity)", () => {
    expect(COMPARES_BOTH("const all = totalParticipants <= submittedCupperCount;")).toBe(true);
    expect(COMPARES_BOTH("const all = submittedCupperCount >= totalParticipants;")).toBe(true);
    expect(COMPARES_BOTH("if (submittedCupperCount === totalParticipants) {")).toBe(true);
    expect(COMPARES_BOTH("const pending = Math.max(0, totalParticipants - submittedCupperCount);")).toBe(false);
    expect(COMPARES_BOTH("items.map((x) => totalParticipants + submittedCupperCount)")).toBe(false);
  });

  it("neither the results page nor the participant-summary route compares the two counts", () => {
    for (const f of [PAGE, ROUTE]) {
      expect(COMPARES_BOTH(stripComments(read(f))), f).toBe(false);
    }
  });
});

describe("viewerMayReadGroupResults", () => {
  const NOW = Date.UTC(2026, 10, 20, 12);
  const open = { isGroup: true, status: "active", closesAt: null as Date | null };
  it("a participant of an open group session cannot read, however many have submitted (there is no such input)", () => {
    expect(viewerMayReadGroupResults(open, { ownerRead: false }, NOW)).toBe(false);
  });
  it("the owner can, and so can anyone once it is closed or past its date", () => {
    expect(viewerMayReadGroupResults(open, { ownerRead: true }, NOW)).toBe(true);
    expect(viewerMayReadGroupResults({ ...open, status: "closed" }, { ownerRead: false }, NOW)).toBe(true);
    expect(viewerMayReadGroupResults({ ...open, closesAt: new Date(NOW - 1) }, { ownerRead: false }, NOW)).toBe(true);
    expect(viewerMayReadGroupResults({ ...open, closesAt: new Date(NOW + 1) }, { ownerRead: false }, NOW)).toBe(false);
  });
  it("never for a solo session", () => {
    expect(viewerMayReadGroupResults({ ...open, isGroup: false, status: "closed" }, { ownerRead: true }, NOW)).toBe(false);
  });
});
