import { describe, expect, it } from "vitest";
import { CUP_COPY_FALLBACK } from "@/lib/cupCopy";
import { SENSORY_DEFECTS } from "@/lib/constants";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

describe("cup copy fallback (cached prop blobs) cannot drift from the message files", () => {
  it("es", () => expect(CUP_COPY_FALLBACK.es).toEqual(es.cupping.cups));
  it("en", () => expect(CUP_COPY_FALLBACK.en).toEqual(en.cupping.cups));
  it("every defect type has a label in both languages", () => {
    for (const d of SENSORY_DEFECTS) {
      expect(es.cupping.cups.types[d]).toBeTruthy();
      expect(en.cupping.cups.types[d]).toBeTruthy();
    }
  });
  it("the results line nouns exist in both languages with the same keys", () => {
    expect(Object.keys(es.results.breakdown.line).sort()).toEqual(Object.keys(en.results.breakdown.line).sort());
  });
});
