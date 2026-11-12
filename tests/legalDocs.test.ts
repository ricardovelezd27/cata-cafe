import { describe, expect, it } from "vitest";
import { PRIVACY } from "@/lib/legal/privacy";
import { TERMS } from "@/lib/legal/terms";
import { LEGAL_NOTICE } from "@/lib/legal/legalNotice";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";
import type { LegalBlock, LegalDoc, LegalDocs } from "@/lib/legal/types";

const DOCS: [string, LegalDocs][] = [
  ["privacy", PRIVACY],
  ["terms", TERMS],
  ["legalNotice", LEGAL_NOTICE],
];

/** Kind plus size: "p", "list:7", "rows:4". */
function shape(b: LegalBlock): string {
  if (typeof b === "string") return "p";
  if ("list" in b) return `list:${b.list.length}`;
  return `rows:${b.rows.length}`;
}

function strings(doc: LegalDoc): string[] {
  const out: string[] = [doc.title, doc.version];
  const walk = (b: LegalBlock) => {
    if (typeof b === "string") out.push(b);
    else if ("list" in b) out.push(...b.list);
    else for (const [a, c] of b.rows) out.push(a, c);
  };
  doc.intro?.forEach(walk);
  for (const s of doc.sections) {
    out.push(s.heading);
    s.body.forEach(walk);
  }
  return out;
}

describe.each(DOCS)("legal document %s", (_name, docs) => {
  it("has a non-empty version in both languages", () => {
    expect(docs.es.version.trim()).not.toBe("");
    expect(docs.en.version.trim()).not.toBe("");
  });

  it("es and en have the same structure, block for block", () => {
    expect(docs.en.sections.length).toBe(docs.es.sections.length);
    docs.es.sections.forEach((s, i) => {
      expect(docs.en.sections[i].body.map(shape)).toEqual(s.body.map(shape));
    });
    // The English intro has exactly one extra first paragraph (translation note).
    const esIntro = (docs.es.intro ?? []).map(shape);
    const enIntro = (docs.en.intro ?? []).map(shape);
    expect(enIntro).toEqual(["p", ...esIntro]);
    expect(docs.en.intro?.[0]).toBe(
      "This is a translation of the Spanish original. In case of discrepancy, the Spanish version prevails.",
    );
  });

  it("carries no placeholder or foreign-product text", () => {
    const banned = [/\[por confirmar\]/i, /\[to confirm\]/i, /caldi/i, /stripe/i, /marketplace/i, /bcrypt/i, /lovable/i];
    for (const lang of ["es", "en"] as const) {
      for (const text of strings(docs[lang])) {
        for (const re of banned) expect(text, `${lang}: ${re}`).not.toMatch(re);
      }
    }
  });
});

describe("waitlistPurgeCutoff", () => {
  const iso = (d: Date) => d.toISOString();
  it("subtracts calendar months, not 30-day steps", () => {
    expect(iso(waitlistPurgeCutoff(new Date("2026-11-13T06:00:00.000Z"), 12))).toBe("2025-11-13T06:00:00.000Z");
    expect(iso(waitlistPurgeCutoff(new Date("2026-11-13T06:00:00.000Z"), 1))).toBe("2026-10-13T06:00:00.000Z");
  });
  it("crosses year boundaries", () => {
    expect(iso(waitlistPurgeCutoff(new Date("2026-02-10T00:00:00.000Z"), 3))).toBe("2025-11-10T00:00:00.000Z");
    expect(iso(waitlistPurgeCutoff(new Date("2026-01-15T00:00:00.000Z"), 12))).toBe("2025-01-15T00:00:00.000Z");
  });
  it("clamps a 29 February to the end of February in a non-leap year", () => {
    expect(iso(waitlistPurgeCutoff(new Date("2028-02-29T12:00:00.000Z"), 12))).toBe("2027-02-28T12:00:00.000Z");
    expect(iso(waitlistPurgeCutoff(new Date("2028-02-29T12:00:00.000Z"), 48))).toBe("2024-02-29T12:00:00.000Z");
  });
  it("clamps end-of-month days to the shorter target month", () => {
    expect(iso(waitlistPurgeCutoff(new Date("2026-03-31T00:00:00.000Z"), 1))).toBe("2026-02-28T00:00:00.000Z");
    expect(iso(waitlistPurgeCutoff(new Date("2026-05-31T00:00:00.000Z"), 1))).toBe("2026-04-30T00:00:00.000Z");
    expect(iso(waitlistPurgeCutoff(new Date("2026-08-31T00:00:00.000Z"), 6))).toBe("2026-02-28T00:00:00.000Z");
  });
});
