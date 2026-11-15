import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FOUNDING_PLAN,
  NEWSLETTER_NOTICE_VERSION,
  NEWSLETTER_PLAN,
  carryMark,
  foundingUpgrade,
  hasNewsletter,
  newsletterMark,
  newsletterSource,
  newsletterWrite,
  withNewsletter,
} from "@/lib/newsletter";
import { planWaitlistMerge, type WaitlistRowFacts } from "@/lib/waitlistMoveRules";

// The newsletter sign-up of the landing page (lib/newsletter.ts): where a
// subscription lives while there is no newsletter table, and what must never
// be lost: a founding reservation, and the day a person opted in.

const DAY = new Date("2026-11-15T10:00:00.000Z");

describe("a new subscription", () => {
  it("is a newsletter-only row, with an optional campaign tag", () => {
    expect(newsletterWrite(null, null, DAY)).toEqual({ kind: "create", plan: NEWSLETTER_PLAN, source: "newsletter" });
    expect(newsletterWrite(null, "Expo_2026", DAY)).toEqual({ kind: "create", plan: NEWSLETTER_PLAN, source: "newsletter:expo_2026" });
    // A tag that is not a short [a-z0-9_-] word is dropped, never stored raw.
    expect(newsletterSource("<script>")).toBe("newsletter");
    expect(newsletterSource("a".repeat(40))).toBe("newsletter");
  });
  it("is recorded under its own notice version", () => {
    expect(NEWSLETTER_NOTICE_VERSION).toMatch(/^newsletter-\d{4}-\d{2}-v\d+$/);
  });
});

describe("an address that already has a founding reservation", () => {
  const founding = { plan: FOUNDING_PLAN, source: "founding" };
  it("keeps its row; the opt-in and its day go at the end of the source", () => {
    expect(newsletterWrite(founding, null, DAY)).toEqual({ kind: "mark", source: "founding+newsletter@2026-11-15" });
    expect(newsletterWrite({ plan: FOUNDING_PLAN, source: "hero:expo" }, null, DAY)).toEqual({
      kind: "mark",
      source: "hero:expo+newsletter@2026-11-15",
    });
  });
  it("signing up twice changes nothing, and the first day is kept", () => {
    const marked = { plan: FOUNDING_PLAN, source: "founding+newsletter@2026-11-15" };
    expect(newsletterWrite(marked, null, new Date("2027-01-01T00:00:00Z"))).toEqual({ kind: "none" });
    expect(withNewsletter(marked.source, new Date("2027-01-01T00:00:00Z"))).toBe(marked.source);
    expect(newsletterWrite({ plan: NEWSLETTER_PLAN, source: "newsletter" }, null, DAY)).toEqual({ kind: "none" });
  });
  it("hasNewsletter reads both forms and nothing else", () => {
    expect(hasNewsletter({ plan: NEWSLETTER_PLAN, source: "newsletter" })).toBe(true);
    expect(hasNewsletter({ plan: FOUNDING_PLAN, source: "founding+newsletter@2026-11-15" })).toBe(true);
    expect(hasNewsletter({ plan: FOUNDING_PLAN, source: "founding" })).toBe(false);
    // A campaign tag that merely contains the word is not an opt-in.
    expect(hasNewsletter({ plan: FOUNDING_PLAN, source: "founding:newsletter" })).toBe(false);
  });
});

describe("a newsletter-only address that reserves a founding seat", () => {
  const row = { plan: NEWSLETTER_PLAN, source: "newsletter:expo", consentAt: new Date("2026-11-01T08:00:00Z"), createdAt: new Date("2026-11-01T08:00:00Z") };
  it("becomes a founding row that keeps the opt-in with ITS day", () => {
    expect(foundingUpgrade(row, "hero")).toEqual({ plan: FOUNDING_PLAN, source: "hero+newsletter@2026-11-01" });
  });
  it("a row that is already a reservation is left alone", () => {
    expect(foundingUpgrade({ ...row, plan: FOUNDING_PLAN, source: "founding" }, "hero")).toBeNull();
  });
  it("the action dates the reservation today and stamps the reservation's own consent", () => {
    const src = readFileSync(resolve(__dirname, "../app/actions/waitlist.ts"), "utf8");
    const block = src.slice(src.indexOf("const upgrade = existing ? foundingUpgrade"), src.indexOf("newsletter_upgrade_failed"));
    expect(block).toContain("createdAt: new Date()");
    expect(block).toContain("consentStamp(LEGAL_PAGES_PUBLISHED, CONSENT_NOTICE_VERSION)");
    // Guarded on the plan it read: a second run finds a founding row and does nothing.
    expect(block).toContain("where: { email, plan: existing.plan }");
  });
});

describe("an email change with a row at both addresses", () => {
  const facts = (id: string, day: number, plan: string, source: string, consent = true): WaitlistRowFacts => ({
    id,
    createdAt: new Date(Date.UTC(2026, 10, day)),
    consentAt: consent ? new Date(Date.UTC(2026, 10, day)) : null,
    consentNoticeVersion: consent ? (plan === NEWSLETTER_PLAN ? NEWSLETTER_NOTICE_VERSION : "2026-11-v2") : null,
    plan,
    source,
  });
  it("a reservation always beats a newsletter-only row, even an earlier one", () => {
    const p = planWaitlistMerge(facts("old", 10, FOUNDING_PLAN, "founding"), facts("new", 2, NEWSLETTER_PLAN, "newsletter"));
    expect(p.keepId).toBe("old");
    expect(p.deleteId).toBe("new");
    // The opt-in travels, with the day of the newsletter row.
    expect(p.source).toBe("founding+newsletter@2026-11-02");
    const q = planWaitlistMerge(facts("old", 2, NEWSLETTER_PLAN, "newsletter"), facts("new", 10, FOUNDING_PLAN, "hero"));
    expect(q.keepId).toBe("new");
    expect(q.source).toBe("hero+newsletter@2026-11-02");
  });
  it("never puts the newsletter's consent stamp on a reservation", () => {
    const p = planWaitlistMerge(facts("old", 10, FOUNDING_PLAN, "founding", false), facts("new", 2, NEWSLETTER_PLAN, "newsletter"));
    expect(p.keepId).toBe("old");
    expect(p.adoptConsent).toBeNull();
  });
  it("two reservations: the earlier one, and a mark on the dropped one is carried", () => {
    const p = planWaitlistMerge(facts("old", 5, FOUNDING_PLAN, "founding"), facts("new", 9, FOUNDING_PLAN, "hero+newsletter@2026-11-09"));
    expect(p.keepId).toBe("old");
    expect(p.source).toBe("founding+newsletter@2026-11-09");
    // The kept one already has its own mark: untouched.
    expect(planWaitlistMerge(facts("old", 5, FOUNDING_PLAN, "founding+newsletter@2026-11-05"), facts("new", 9, FOUNDING_PLAN, "hero+newsletter@2026-11-09")).source).toBeNull();
  });
  it("two newsletter-only rows: the earlier one, nothing to carry", () => {
    const p = planWaitlistMerge(facts("old", 5, NEWSLETTER_PLAN, "newsletter"), facts("new", 9, NEWSLETTER_PLAN, "newsletter:expo"));
    expect(p.keepId).toBe("old");
    expect(p.source).toBeNull();
  });
  it("rows read without plan and source behave exactly as before", () => {
    const bare = (id: string, day: number): WaitlistRowFacts => ({ id, createdAt: new Date(Date.UTC(2026, 0, day)), consentAt: null, consentNoticeVersion: null });
    expect(planWaitlistMerge(bare("old", 9), bare("new", 5))).toEqual({ keepId: "new", deleteId: "old", adoptConsent: null, source: null });
  });
  it("the move reads plan and source and writes the carried source", () => {
    const src = readFileSync(resolve(__dirname, "../lib/waitlistMove.ts"), "utf8");
    expect(src).toMatch(/plan: true,\s+source: true,/);
    expect(src).toContain("plan.source ? { source: plan.source } : {}");
  });
});

describe("marks", () => {
  it("newsletterMark gives the dated mark of either kind of row, or null", () => {
    const at = new Date("2026-11-03T09:00:00Z");
    expect(newsletterMark({ plan: NEWSLETTER_PLAN, source: "newsletter", consentAt: at, createdAt: at })).toBe("+newsletter@2026-11-03");
    expect(newsletterMark({ plan: FOUNDING_PLAN, source: "hero+newsletter@2026-10-01", consentAt: at, createdAt: at })).toBe("+newsletter@2026-10-01");
    expect(newsletterMark({ plan: FOUNDING_PLAN, source: "hero", consentAt: at, createdAt: at })).toBeNull();
    expect(carryMark("hero", "+newsletter@2026-10-01")).toBe("hero+newsletter@2026-10-01");
    expect(carryMark("hero+newsletter@2026-09-09", "+newsletter@2026-10-01")).toBe("hero+newsletter@2026-09-09");
  });
});

describe("the sign-up action", () => {
  const src = readFileSync(resolve(__dirname, "../app/actions/waitlist.ts"), "utf8");
  const action = src.slice(src.indexOf("export async function subscribeNewsletter"));
  it("sends no email and creates no account", () => {
    expect(action).not.toContain("sendMagicLink");
    expect(action).not.toContain("signInWithOtp");
    expect(action).not.toContain("sendEmail");
  });
  it("checks the honeypot and the address before anything else, and is rate limited", () => {
    expect(action.indexOf('formData.get("company")')).toBeLessThan(action.indexOf("reserveEmailBudget"));
    expect(action.indexOf("EMAIL_RE.test(email)")).toBeLessThan(action.indexOf("reserveEmailBudget"));
    expect(action.indexOf("reserveEmailBudget")).toBeLessThan(action.indexOf("waitlistEntry"));
    // Its own bucket per address: never shared with sign-in attempts.
    expect(action).toContain("subject: `newsletter:${email}`");
  });
  it("stores the consent time and the newsletter's notice version", () => {
    expect(action).toContain("consentAt: now");
    expect(action).toContain("consentNoticeVersion: NEWSLETTER_NOTICE_VERSION");
  });
});

describe("the privacy policy says it", () => {
  for (const loc of ["es", "en"] as const) {
    const text = readFileSync(resolve(__dirname, `../lib/legal/${loc}/privacy.ts`), "utf8");
    it(`${loc}: the newsletter is in what we collect, why, how long and section 11`, () => {
      const word = loc === "es" ? /bolet[íi]n/gi : /newsletter/gi;
      expect((text.match(word) ?? []).length).toBeGreaterThanOrEqual(5);
      expect(text).not.toMatch(loc === "es" ? /Actualmente no enviamos comunicaciones comerciales/ : /We currently do not send commercial communications/);
      // The period comes from the constant, never a literal.
      expect(text).toMatch(loc === "es" ? /Suscripción al boletín:[^`]*\$\{WAITLIST_RETENTION_MONTHS\}/ : /Newsletter subscription:[^`]*\$\{WAITLIST_RETENTION_MONTHS\}/);
    });
  }
  it("the form's consent line names who is responsible and how to stop", () => {
    for (const loc of ["es", "en"]) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../messages/${loc}.json`), "utf8")).landing.newsletter;
      expect(m.notice).toContain("{company}");
      expect(m.notice).toContain("{email}");
      // Honest: the newsletter does not exist yet.
      expect(m.lead).toMatch(loc === "es" ? /preparando/ : /preparing/);
    }
  });
});
