import { describe, expect, it } from "vitest";
import {
  parseLastFormat,
  parseWizardHandoff,
  wizardHandoffQuery,
} from "@/lib/sessionDefaults";

describe("sessionDefaults", () => {
  it("remembers only real formats", () => {
    expect(parseLastFormat("combined")).toBe("combined");
    expect(parseLastFormat("nope")).toBeNull();
    expect(parseLastFormat(null)).toBeNull();
  });

  it("parses a valid handoff", () => {
    expect(parseWizardHandoff({ name: " Cata A ", format: "affective", n: "6" })).toEqual({
      name: "Cata A",
      format: "affective",
      sampleCount: 6,
    });
  });

  it("silently drops bad values", () => {
    expect(parseWizardHandoff({ name: "x".repeat(500), format: "evil", n: "99" })).toEqual({});
    expect(parseWizardHandoff({ n: "0" })).toEqual({});
    expect(parseWizardHandoff({ n: "3abc" })).toEqual({});
    expect(parseWizardHandoff({ name: ["a", "b"] })).toEqual({ name: "a" });
  });

  it("round-trips through the query string", () => {
    const q = wizardHandoffQuery({ name: "Cata & café", format: "combined", sampleCount: 4 });
    const p = new URLSearchParams(q.slice(1));
    expect(
      parseWizardHandoff({ name: p.get("name"), format: p.get("format"), n: p.get("n") }),
    ).toEqual({ name: "Cata & café", format: "combined", sampleCount: 4 });
  });
});
