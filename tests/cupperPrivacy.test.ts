import { describe, expect, it } from "vitest";
import { anonymizeCuppers, cupperHash } from "@/lib/analytics/cupperPrivacy";

const SECRET = "test-secret";
const totals = new Map([
  ["a", 5],
  ["b", 2],
]);
const opts = { secret: SECRET, totals };

const all = [
  { cupperId: "b", cupperName: "Bea" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "a", cupperName: "Ana" },
  { cupperId: "b", cupperName: "Bea" },
];
const platform = { kind: "platform" } as const;

describe("anonymizeCuppers", () => {
  it("leaves user scope untouched", () => {
    expect(anonymizeCuppers(all, { kind: "user", userId: "x" })).toBe(all);
  });

  it("uses a keyed hash for key and label, and leaks no real id or name", () => {
    const out = anonymizeCuppers(all, platform, opts);
    const a = out.find((r) => r.cupperName?.startsWith("Catador") && r.cupperSuppressed === false)!;
    expect(a.cupperName).toBe(`Catador ${cupperHash("a", SECRET).slice(0, 4).toUpperCase()}`);
    expect(a.cupperId).toBe(`c_${cupperHash("a", SECRET).slice(0, 16)}`);
    expect(a.cupperId).not.toBe("a");
    expect(JSON.stringify(out)).not.toMatch(/Ana|Bea/);
    expect(out.every((r) => r.cupperId !== "a" && r.cupperId !== "b")).toBe(true);
  });

  it("gives the same label under any filter (subset of rows)", () => {
    const full = anonymizeCuppers(all, platform, opts);
    const subset = anonymizeCuppers([all[2]], platform, opts);
    expect(subset[0].cupperName).toBe(full[2].cupperName);
    expect(subset[0].cupperId).toBe(full[2].cupperId);
  });

  it("depends on the secret", () => {
    const other = anonymizeCuppers([all[1]], platform, { ...opts, secret: "another" });
    expect(other[0].cupperId).not.toBe(anonymizeCuppers([all[1]], platform, opts)[0].cupperId);
  });

  it("suppresses by whole-scope count, not by filtered rows", () => {
    // 'a' has only ONE row in this filtered view but 5 in the scope: shown.
    const filtered = anonymizeCuppers([all[1]], platform, opts);
    expect(filtered[0].cupperSuppressed).toBe(false);
    // 'b' has 2 in the scope: suppressed even though 5 rows are present.
    const b = anonymizeCuppers(
      [all[0], all[0], all[0], all[0], all[0]],
      platform,
      opts,
    );
    expect(b.every((r) => r.cupperSuppressed === true)).toBe(true);
  });
});
