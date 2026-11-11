import { describe, expect, it } from "vitest";
import { buildStampLine, buildStampLines, draftLabel, stampDateTime } from "@/lib/pdf/stampText";
import { dateSlug } from "@/lib/pdf/filename";

const at = new Date("2026-11-10T14:32:00Z");

describe("report stamp text (S8-12, F-informes-3 / F-resultados-8)", () => {
  it("states the server clock in UTC and the language", () => {
    const es = buildStampLines({ locale: "es", generatedAt: at });
    expect(es).toHaveLength(1);
    expect(es[0]).toContain("UTC");
    expect(es[0]).toContain("ES");
    expect(es[0]).toContain("14:32");
    const en = buildStampLines({ locale: "en", generatedAt: at });
    expect(en[0]).toContain("Generated");
    expect(en[0]).toContain("EN");
  });

  it("puts the draft marker first", () => {
    const lines = buildStampLines({ locale: "es", generatedAt: at, draft: true });
    expect(lines[0]).toBe(draftLabel("es"));
    expect(lines[0]).toMatch(/BORRADOR/);
    expect(buildStampLines({ locale: "en", generatedAt: at, draft: true })[0]).toMatch(/DRAFT/);
  });

  it("adds the n-of-N line only for a non-empty group", () => {
    const withN = buildStampLines({
      locale: "es",
      generatedAt: at,
      inclusion: { included: 4, total: 5 },
    });
    expect(withN.join("|")).toContain("4 de 5");
    const none = buildStampLines({ locale: "es", generatedAt: at, inclusion: { included: 0, total: 0 } });
    expect(none).toHaveLength(1);
  });

  it("discloses the viewer's own exclusion without a reason", () => {
    const lines = buildStampLines({ locale: "es", generatedAt: at, viewerExcluded: true }).join("|");
    expect(lines).toMatch(/no est/i);
    expect(lines).not.toMatch(/protocol|calibr|error de muestra/i);
  });

  it("mentions post-close changes", () => {
    const line = buildStampLine({
      locale: "en",
      generatedAt: at,
      resultsUpdatedAt: new Date("2026-11-11T08:00:00Z"),
      originEditedAt: new Date("2026-11-12T09:15:00Z"),
    });
    expect(line).toContain("Results updated on");
    expect(line).toContain("Origin edited on");
  });

  it("formats dates in UTC regardless of the host timezone", () => {
    expect(stampDateTime(new Date("2026-11-10T23:59:00Z"), "en")).toContain("23:59");
  });
});

describe("dateSlug", () => {
  it("is YYYYMMDD in UTC", () => {
    expect(dateSlug(new Date("2026-11-10T23:59:00Z"))).toBe("20261110");
    expect(dateSlug(new Date("2026-01-02T00:00:00Z"))).toBe("20260102");
  });
});
