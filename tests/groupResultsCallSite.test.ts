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
  const A = /submittedCupperCount|submittedCount/g;
  const B = /totalParticipants|participants\.length|participantCount/g;
  // Third review L4: whole STATEMENTS, not lines. Every pair (submitted count, total) inside ONE
  // statement (no `;` between them, newlines are just whitespace) with a comparison operator
  // between them is a hidden "everyone has submitted" test, however the author wrapped the line.
  const COMPARES_BOTH = (src: string) => {
    const hits = (re: RegExp) => [...src.matchAll(re)].map((m) => ({ s: m.index!, e: m.index! + m[0].length }));
    for (const a of hits(A)) {
      for (const b of hits(B)) {
        const [lo, hi] = a.s < b.s ? [a, b] : [b, a];
        const between = src.slice(lo.e, hi.s);
        if (between.includes(";") || between.length > 160) continue;
        if (CMP.test(between)) return true;
      }
    }
    return false;
  };
  // `pendingParticipants` (total - submitted) compared with zero is the same test in other words.
  const PENDING_IS_ZERO = (src: string) =>
    /pendingParticipants\s*(?:===|==|<=|<)\s*[01]\b/.test(src) ||
    /\b[01]\s*(?:===|==|>=|>)\s*pendingParticipants\b/.test(src) ||
    /!\s*pendingParticipants\b/.test(src) ||
    /!\s*\(\s*pendingParticipants\s*>\s*0\s*\)/.test(src);

  it("the comparison scan catches both operand orders, every operator and wrapped lines (sanity)", () => {
    expect(COMPARES_BOTH("const all = totalParticipants <= submittedCupperCount;")).toBe(true);
    expect(COMPARES_BOTH("const all = submittedCupperCount >= totalParticipants;")).toBe(true);
    expect(COMPARES_BOTH("if (submittedCupperCount === totalParticipants) {")).toBe(true);
    // the reviewer's surviving shape: the operator on another line than one of the operands
    expect(COMPARES_BOTH("const all =\n  submittedCupperCount\n    >= totalParticipants;")).toBe(true);
    expect(COMPARES_BOTH("const all = totalParticipants\n  <= submittedCupperCount;")).toBe(true);
    expect(COMPARES_BOTH("const pending = Math.max(0, totalParticipants - submittedCupperCount);")).toBe(false);
    expect(COMPARES_BOTH("items.map((x) => totalParticipants + submittedCupperCount)")).toBe(false);
    expect(COMPARES_BOTH("const a = submittedCupperCount;\nconst b = x > totalParticipants;")).toBe(false);
  });

  it("the zero-pending scan catches every spelling of 'nobody is pending' (sanity)", () => {
    for (const bad of [
      "const all = pendingParticipants === 0;",
      "const all = pendingParticipants == 0;",
      "const all = pendingParticipants <= 0;",
      "const all = pendingParticipants < 1;",
      "const all = 0 === pendingParticipants;",
      "const all = !pendingParticipants;",
      "const all = !(pendingParticipants > 0);",
      "const all =\n  pendingParticipants\n  === 0;",
    ]) {
      expect(PENDING_IS_ZERO(bad), bad).toBe(true);
    }
    // the banner's own use (canViewGroup is already true there) stays legal
    expect(PENDING_IS_ZERO("session.isGroup && canViewGroup && pendingParticipants > 0")).toBe(false);
    expect(PENDING_IS_ZERO("const pendingParticipants = Math.max(0, total - n);")).toBe(false);
  });

  it("neither the results page nor the participant-summary route compares the two counts", () => {
    for (const f of [PAGE, ROUTE]) {
      expect(COMPARES_BOTH(stripComments(read(f))), f).toBe(false);
    }
  });

  it("neither of them tests pendingParticipants against zero as an 'everyone submitted' flag", () => {
    for (const f of [PAGE, ROUTE]) {
      expect(PENDING_IS_ZERO(stripComments(read(f))), f).toBe(false);
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
