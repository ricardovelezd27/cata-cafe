import { describe, expect, it } from "vitest";
import { anonymizeCuppers } from "@/lib/analytics/cupperPrivacy";

const rows = [
  { cupperId: "b", cupperName: "Bea" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "b", cupperName: "Bea" },
];

describe("anonymizeCuppers", () => {
  it("leaves user scope untouched", () => {
    expect(anonymizeCuppers(rows, { kind: "user", userId: "x" })).toBe(rows);
  });
  it("replaces names with stable Catador N in platform scope", () => {
    const out = anonymizeCuppers(rows, { kind: "platform" });
    expect(out.map((r) => r.cupperName)).toEqual([
      "Catador 2", "Catador 1", "Catador 1", "Catador 1", "Catador 2",
    ]);
    expect(JSON.stringify(out)).not.toMatch(/Ana|Bea/);
    expect(anonymizeCuppers(rows, { kind: "platform" })).toEqual(out);
  });
  it("suppresses cuppers with fewer than 3 evaluations", () => {
    const out = anonymizeCuppers(rows, { kind: "platform" });
    expect(out.find((r) => r.cupperId === "a")?.cupperSuppressed).toBe(false);
    expect(out.find((r) => r.cupperId === "b")?.cupperSuppressed).toBe(true);
  });
});
