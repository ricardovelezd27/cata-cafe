import { describe, expect, it } from "vitest";
import { PRIVACY } from "@/lib/legal/privacy";
import { TERMS } from "@/lib/legal/terms";
import { LEGAL_NOTICE } from "@/lib/legal/legalNotice";
import { LEGAL_ENTITY } from "@/lib/legal/company";
import { LEGAL_PAGES_PUBLISHED, WAITLIST_RETENTION_MONTHS } from "@/lib/legal/config";
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { SIGNIN_INTENT_MAX_AGE_S } from "@/lib/signInIntent";
import { SIGNIN_PENDING_MAX_AGE_S } from "@/lib/signInPending";
import { waitlistIdsToDelete, waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";
import type { LegalBlock, LegalDoc, LegalDocs } from "@/lib/legal/types";

const DOCS: [string, LegalDocs][] = [
  ["privacy", PRIVACY],
  ["terms", TERMS],
  ["legalNotice", LEGAL_NOTICE],
];

/** Kind plus size: "p", "sub", "list:7", "rows:4". */
function shape(b: LegalBlock): string {
  if (typeof b === "string") return "p";
  if ("sub" in b) return "sub";
  if ("list" in b) return `list:${b.list.length}`;
  return `rows:${b.rows.length}`;
}

function strings(doc: LegalDoc): string[] {
  const out: string[] = [doc.title, doc.version];
  const walk = (b: LegalBlock) => {
    if (typeof b === "string") out.push(b);
    else if ("sub" in b) out.push(b.sub);
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

const joined = (doc: LegalDoc) => strings(doc).join("\n");

describe.each(DOCS)("legal document %s", (_name, docs) => {
  it("has a non-empty version in both languages", () => {
    expect(docs.es.version.trim()).not.toBe("");
    expect(docs.en.version.trim()).not.toBe("");
  });

  it("es and en have the same structure, block for block (paragraph, sub, list, rows)", () => {
    expect(docs.en.sections.length).toBe(docs.es.sections.length);
    docs.es.sections.forEach((s, i) => {
      expect(docs.en.sections[i].body.map(shape), `section ${i + 1}`).toEqual(s.body.map(shape));
    });
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

  it("never prints the personal contact details of the source documents", () => {
    for (const lang of ["es", "en"] as const) {
      const all = joined(docs[lang]).toLowerCase();
      expect(all, lang).not.toContain("hckdstudio");
      expect(all, lang).not.toContain("610 089");
      expect(all, lang).not.toContain("610089");
    }
  });

  it("interpolates the same company constants in both languages", () => {
    const es = joined(docs.es);
    const en = joined(docs.en);
    for (const value of [LEGAL_ENTITY.name, LEGAL_ENTITY.cif, LEGAL_ENTITY.address, SUPPORT_EMAIL]) {
      expect(es, `es: ${value}`).toContain(value);
      expect(en, `en: ${value}`).toContain(value);
    }
    // No English text carries another email address than the support address.
    const emails = en.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
    for (const e of emails) expect(e.replace(/[.]+$/, "")).toBe(SUPPORT_EMAIL);
    expect(docs.en.version).not.toBe(docs.es.version);
  });
});

describe("privacy policy specifics", () => {
  it("states the same retention number in both languages, taken from the constant", () => {
    const es = [...joined(PRIVACY.es).matchAll(/(\d+) meses/g)].map((m) => Number(m[1]));
    const en = [...joined(PRIVACY.en).matchAll(/(\d+) months/g)].map((m) => Number(m[1]));
    expect(es.length).toBeGreaterThan(0);
    expect(en.length).toBe(es.length);
    for (const n of [...es, ...en]) expect(n).toBe(WAITLIST_RETENTION_MONTHS);
  });

  it("ties the cookie lifetimes in the cookie table to the code constants", () => {
    const rows = (doc: LegalDoc) =>
      doc.sections
        .flatMap((s) => s.body)
        .flatMap((b) => (typeof b !== "string" && "rows" in b ? b.rows : []));
    const hours = SIGNIN_INTENT_MAX_AGE_S / 3600;
    const minutes = SIGNIN_PENDING_MAX_AGE_S / 60;
    const cell = (doc: LegalDoc, name: string) => rows(doc).find(([k]) => k === name)?.[1];
    expect(cell(PRIVACY.es, "cata_signin_intent")).toMatch(new RegExp(`${hours} hora\\.$`));
    expect(cell(PRIVACY.es, "cata_signin_pending")).toMatch(new RegExp(`${minutes} minutos\\.$`));
    expect(cell(PRIVACY.en, "cata_signin_intent")).toMatch(new RegExp(`${hours} hour\\.$`));
    expect(cell(PRIVACY.en, "cata_signin_pending")).toMatch(new RegExp(`${minutes} minutes\\.$`));
  });

  it("does not list the locale cookie, which the app no longer sets", () => {
    expect(joined(PRIVACY.es)).not.toContain("NEXT_LOCALE");
    expect(joined(PRIVACY.en)).not.toContain("NEXT_LOCALE");
  });

  it("links the English terms and notice to the English privacy route", () => {
    expect(joined(TERMS.en)).toContain(`${LEGAL_ENTITY.site}/en/privacidad`);
    expect(joined(LEGAL_NOTICE.en)).toContain(`${LEGAL_ENTITY.site}/en/privacidad`);
    expect(joined(TERMS.es)).toContain(`${LEGAL_ENTITY.site}/privacidad`);
  });
});

describe("publishing guard", () => {
  it("does not allow publishing without the Registro Mercantil data", () => {
    if (LEGAL_PAGES_PUBLISHED) {
      expect(
        LEGAL_ENTITY.registry,
        "LEGAL_PAGES_PUBLISHED is true but LEGAL_ENTITY.registry is null. The Registro Mercantil data is mandatory under LSSI-CE art. 10.1(b): fill it in lib/legal/company.ts, or consciously change this test.",
      ).not.toBeNull();
    } else {
      expect(LEGAL_PAGES_PUBLISHED).toBe(false);
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

describe("waitlistIdsToDelete (account exists -> keep)", () => {
  const rows = [
    { id: "a", email: "ana@example.com" },
    { id: "b", email: "bea@example.com" },
    { id: "c", email: "carla@example.com" },
  ];
  it("keeps a row whose address has an account and deletes the others", () => {
    expect(waitlistIdsToDelete(rows, ["bea@example.com"])).toEqual(["a", "c"]);
  });
  it("ignores case differences on either side", () => {
    expect(waitlistIdsToDelete(rows, ["ANA@Example.COM"])).toEqual(["b", "c"]);
    expect(waitlistIdsToDelete([{ id: "x", email: "Dora@Example.com" }], ["dora@example.com"])).toEqual([]);
  });
  it("ignores surrounding spaces", () => {
    expect(waitlistIdsToDelete(rows, ["  carla@example.com "])).toEqual(["a", "b"]);
    expect(waitlistIdsToDelete([{ id: "x", email: " eva@example.com " }], ["eva@example.com"])).toEqual([]);
  });
  it("deletes every candidate when the account set is empty", () => {
    expect(waitlistIdsToDelete(rows, [])).toEqual(["a", "b", "c"]);
    expect(waitlistIdsToDelete(rows, [null, undefined, ""])).toEqual(["a", "b", "c"]);
  });
  it("matches exactly, never by pattern or substring", () => {
    expect(waitlistIdsToDelete(rows, ["ana@example.co", "na@example.com", "ana@example.com.mx", "%@example.com"])).toEqual(["a", "b", "c"]);
  });
  it("keeps a candidate equal to an account address", () => {
    expect(waitlistIdsToDelete([{ id: "z", email: "same@example.com" }], ["same@example.com"])).toEqual([]);
  });
});
