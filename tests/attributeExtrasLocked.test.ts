import { describe, expect, it } from "vitest";
import { AttributeExtras, PARTIAL_COPY_FALLBACK } from "@/components/cupping/AttributeExtras";

// S10 WP3b x WP5b: under the reference pin (`lockedAffective`, the same flag that disables the bubbles)
// neither the "No evaluado" toggle nor the cooled-value control is rendered, so nothing new can be written.
describe("AttributeExtras under the pin", () => {
  const props = { data: { aroma_af_final: 5 }, onChange: () => {}, attrId: "aroma_af", copy: PARTIAL_COPY_FALLBACK.es };

  it("renders nothing when locked", () => {
    expect(AttributeExtras({ ...props, locked: true })).toBeNull();
  });

  it("renders the controls when not locked", () => {
    expect(AttributeExtras({ ...props, locked: false })).not.toBeNull();
  });
});
