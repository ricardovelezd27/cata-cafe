import { describe, expect, it } from "vitest";
import { sampleCountWarning } from "@/lib/sampleCount";

describe("sampleCountWarning (X6, never a cap)", () => {
  it("warns above 6 for descriptive and affective", () => {
    for (const f of ["descriptive", "affective"]) {
      expect(sampleCountWarning(f, 6)).toBeNull();
      expect(sampleCountWarning(f, 7)).toBe("many");
      expect(sampleCountWarning(f, 20)).toBe("many");
    }
  });

  it("warns above 4 for combined, with the tighter line", () => {
    expect(sampleCountWarning("combined", 4)).toBeNull();
    expect(sampleCountWarning("combined", 5)).toBe("combined");
    expect(sampleCountWarning("combined", 10)).toBe("combined");
  });

  it("never warns for small counts", () => {
    for (const f of ["descriptive", "affective", "combined"]) {
      expect(sampleCountWarning(f, 1)).toBeNull();
      expect(sampleCountWarning(f, 0)).toBeNull();
    }
  });
});
