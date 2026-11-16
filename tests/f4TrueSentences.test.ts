// UX audit F4 (sentences that are not true, buttons that do not do what they say).
// Pure rules and message copy only; the screens themselves are checked by eye.
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { finishedSessionWhere, isSessionExpired } from "@/lib/sessionState";
import { isActive } from "@/components/layout/navItems";

type Row = { status: string; closesAt: Date | null };
type Translate = (key: string, args?: Record<string, unknown>) => string;

// next-intl types its translator from the app's message shape; the test only
// needs the formatting, so it takes a loosely typed one.
function translator(locale: "es" | "en", namespace: string): Translate {
  const messages = (locale === "es" ? es : en) as unknown as Record<string, unknown>;
  return createTranslator({ locale, messages, namespace } as never) as unknown as Translate;
}

// A tiny evaluator for the exact shape finishedSessionWhere returns, so the
// database rule and `isSessionExpired` are checked against the same rows.
function matches(where: ReturnType<typeof finishedSessionWhere>, row: Row): boolean {
  return where.OR.some((cond) => {
    if ("status" in cond) return row.status === cond.status;
    return row.closesAt !== null && row.closesAt < cond.closesAt.lt;
  });
}

describe("A-09: 'sesiones realizadas' counts finished sessions only", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const rows: Row[] = [
    { status: "active", closesAt: null }, // open, no deadline
    { status: "active", closesAt: new Date("2026-11-20T00:00:00Z") }, // open, deadline ahead
    { status: "active", closesAt: new Date("2026-11-10T00:00:00Z") }, // expired, cron has not closed it yet
    { status: "closed", closesAt: null },
    { status: "closed", closesAt: new Date("2026-11-20T00:00:00Z") },
    { status: "draft", closesAt: null },
  ];

  it("agrees with isSessionExpired on every row", () => {
    for (const row of rows) {
      expect(matches(finishedSessionWhere(now), row), JSON.stringify(row)).toBe(isSessionExpired(row, now));
    }
  });

  it("does not count the open sessions (6 rows, 3 finished)", () => {
    expect(rows.filter((r) => matches(finishedSessionWhere(now), r))).toHaveLength(3);
  });
});

describe("D-03: Insights tabs are active in Spanish (unprefixed) and English (prefixed)", () => {
  it("marks the explorer tab active under both URL shapes", () => {
    expect(isActive("/app/insights/explorer", "es", "/app/insights/explorer")).toBe(true);
    expect(isActive("/en/app/insights/explorer", "en", "/app/insights/explorer")).toBe(true);
  });

  it("marks the dashboard tab active only on its own page", () => {
    expect(isActive("/app/insights", "es", "/app/insights", true)).toBe(true);
    expect(isActive("/app/insights/explorer", "es", "/app/insights", true)).toBe(false);
  });
});

describe("A-12 and I-06: counts read right for one and for many", () => {
  const es_ = translator("es", "offline");
  const en_ = translator("en", "offline");
  const args = (pending: number) => ({ included: 9, total: 9 + pending, pending });

  it("a closed session says they did not submit, not that they have not synced", () => {
    expect(es_("partialSyncNoticeClosed", args(5))).toContain("5 no enviaron");
    expect(es_("partialSyncNoticeClosed", args(1))).toContain("1 no envió");
    expect(es_("partialSyncNoticeClosed", args(5))).not.toContain("sincroniz");
    expect(en_("partialSyncNoticeClosed", args(5))).toContain("5 did not submit");
  });

  it("an open session keeps the sync wording, with the verb in agreement", () => {
    expect(es_("partialSyncNotice", args(5))).toContain("5 aún no han sincronizado");
    expect(es_("partialSyncNotice", args(1))).toContain("1 aún no ha sincronizado");
    expect(en_("partialSyncNotice", args(1))).toContain("1 has not synced yet");
    expect(en_("partialSyncNotice", args(2))).toContain("2 have not synced yet");
  });

  it("the dashboard counts take the right singular", () => {
    const dEs = translator("es", "dashboard");
    const dEn = translator("en", "dashboard");
    expect(dEs("samplesCount", { count: 1 })).toBe("1 muestra");
    expect(dEs("samplesCount", { count: 3 })).toBe("3 muestras");
    expect(dEn("samplesCount", { count: 1 })).toBe("1 sample");
    expect(dEn("cuppingsCount", { count: 1 })).toBe("1 cupping");
    expect(dEs("cuppingsCount", { count: 1 })).toBe("1 catación");
  });

  it("client-filled counts put the number last, so no singular is wrong", () => {
    for (const dict of [es, en] as unknown as Array<{ offline: Record<string, string> }>) {
      for (const key of ["pendingDrafts", "unsyncedNotes", "closedUnsentDrafts", "terminalNotice"]) {
        expect(dict.offline[key], key).toMatch(/\{count\}/);
        expect(dict.offline[key], key).not.toMatch(/^\{count\}/);
      }
    }
  });

  it("one word for a note that has not reached the server: no 'borradores' / 'drafts' on the badge", () => {
    for (const [dict, word] of [
      [es, /borrador/i],
      [en, /draft/i],
    ] as unknown as Array<[{ offline: Record<string, string> }, RegExp]>) {
      for (const key of ["pendingDrafts", "staleDrafts", "closedUnsentDrafts", "bannerStorageUnavailable"]) {
        expect(dict.offline[key], key).not.toMatch(word);
      }
    }
  });
});

describe("C-04: the onboarding join path says what to do", () => {
  it("never promises a code field that does not exist", () => {
    const join = (es as unknown as { onboarding: { paths: { join: { description: string } } } }).onboarding.paths.join;
    const joinEn = (en as unknown as { onboarding: { paths: { join: { description: string } } } }).onboarding.paths.join;
    expect(join.description).not.toMatch(/c[oó]digo de invitaci[oó]n/i);
    expect(join.description).toMatch(/enlace/i);
    expect(join.description).toMatch(/QR/);
    expect(joinEn.description).not.toMatch(/invitation code/i);
    expect(joinEn.description).toMatch(/link/i);
    expect(joinEn.description).toMatch(/QR/);
  });
});

describe("error codes say what to do next (I-06)", () => {
  it("the codes that named only the problem now end with a way out", () => {
    const withNextStep = [
      "invalid_token",
      "token_expired",
      "token_exhausted",
      "not_found",
      "invalid_reference",
      "coffee_not_usable",
      "already_claimed",
      "entries_closed",
      "group_full",
      "session_closed",
      "sample_revealed",
      "not_found_or_forbidden",
    ];
    for (const dict of [es, en] as unknown as Array<{ errors: { codes: Record<string, string> } }>) {
      for (const code of withNextStep) {
        const text = dict.errors.codes[code];
        // More than one sentence: the problem, then what to do.
        expect(text.split(/[.;] /).length, code).toBeGreaterThan(1);
      }
    }
  });

  it("both locales keep the same error codes", () => {
    const keys = (d: unknown) => Object.keys((d as { errors: { codes: object } }).errors.codes).sort();
    expect(keys(en)).toEqual(keys(es));
  });
});
