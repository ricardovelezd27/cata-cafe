import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  referenceCopySuffix,
  referenceExplanation,
  shouldPinReference,
} from "@/lib/referenceRules";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

const FORMATS = ["descriptive", "affective", "combined"] as const;
const MODES = ["anchor", "free"] as const;

describe("reference wording follows format AND mode (S10 WP6b)", () => {
  for (const f of FORMATS) {
    for (const m of MODES) {
      it(`${f} / ${m}: wording is "pinned" exactly when the pin applies`, () => {
        const pinned = shouldPinReference({ mode: m, moduleKey: f, isActiveReference: true });
        expect(referenceExplanation({ mode: m, moduleKey: f }) === "pinned").toBe(pinned);
      });
    }
  }

  it("a descriptive session is never pinned wording, in both modes", () => {
    for (const m of MODES) {
      expect(referenceExplanation({ mode: m, moduleKey: "descriptive" })).toBe("descriptive");
    }
  });

  it("the copy keys of a descriptive anchor-mode session carry no 79 or fixed claim", () => {
    const suffix = referenceCopySuffix(referenceExplanation({ mode: "anchor", moduleKey: "descriptive" }));
    expect(suffix).toBe("Descriptive");
    for (const m of [es, en] as Array<{ results: { dashboard: Record<string, string>; help: { referencia: Record<string, string> } } }>) {
      const dash = m.results.dashboard;
      const strings = [
        dash[`anchorTitle${suffix}`],
        dash[`anchorHint${suffix}`],
        m.results.help.referencia[`body${suffix}`],
      ];
      for (const s of strings) {
        expect(typeof s).toBe("string");
        expect(s).not.toMatch(/79|fija|fijad|fixed|pinned/i);
      }
    }
  });

  it("pinned and free keep their own copy", () => {
    expect(referenceCopySuffix("pinned")).toBe("");
    expect(referenceCopySuffix("free")).toBe("Free");
  });

  it("no surface chooses the 79.00 wording by the mode alone", () => {
    const pdf = readFileSync("lib/pdf/ParticipantSummaryDocument.tsx", "utf8");
    expect(pdf).not.toMatch(/referenceMode === "free"/);
    expect(pdf).toContain("referenceExplanation");
    const page = readFileSync("app/[locale]/app/sessions/[id]/results/page.tsx", "utf8");
    expect(page).not.toMatch(/referenceMode === "free"/);
    expect(page).toContain("referenceExplanation");
  });
});
