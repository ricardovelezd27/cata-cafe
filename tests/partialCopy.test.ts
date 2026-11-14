import { describe, expect, it } from "vitest";
import { PARTIAL_COPY_FALLBACK } from "@/components/cupping/AttributeExtras";
import { TIMER_COPY_FALLBACK } from "@/components/cupping/CuppingTimer";
import es from "../messages/es.json";
import en from "../messages/en.json";

// S10 WP3b: the in-code fallbacks (used only when the cup error boundary rehydrates an older cached
// prop blob) must equal the message files, and both languages must carry the same keys.
const msgs = { es, en } as const;

describe("cupping.partial and cupping.timer copy", () => {
  for (const lang of ["es", "en"] as const) {
    it(`${lang}: PARTIAL_COPY_FALLBACK equals cupping.partial`, () => {
      expect(PARTIAL_COPY_FALLBACK[lang]).toEqual(msgs[lang].cupping.partial);
    });
    it(`${lang}: TIMER_COPY_FALLBACK equals cupping.timer`, () => {
      expect(TIMER_COPY_FALLBACK[lang]).toEqual(msgs[lang].cupping.timer);
    });
  }

  it("both languages carry the same keys, including the results copy", () => {
    expect(Object.keys(es.cupping.partial).sort()).toEqual(Object.keys(en.cupping.partial).sort());
    expect(Object.keys(es.cupping.timer).sort()).toEqual(Object.keys(en.cupping.timer).sort());
    expect(Object.keys(es.results.partial).sort()).toEqual(Object.keys(en.results.partial).sort());
  });

  it("the client-replaced templates keep their placeholders in both languages", () => {
    for (const lang of ["es", "en"] as const) {
      const p = msgs[lang].cupping.partial;
      expect(p.cooledSummary).toContain("{from}");
      expect(p.cooledSummary).toContain("{to}");
      expect(p.submitNote).toContain("{sample}");
      expect(p.includesOne).toContain("{n}");
      expect(p.includesMany).toContain("{n}");
      expect(msgs[lang].results.partial.cooledSummary).toContain("{from}");
      expect(msgs[lang].results.partial.includesOne).toContain("{n}");
    }
  });
});
