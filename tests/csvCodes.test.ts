import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assignCsvCodes } from "@/lib/reports/csvCodes";

// Mirrors csvCodeKey.ts (server-only, so not importable here): same derivation.
function digests(secret: string, sessionId: string, ids: string[]) {
  return new Map(
    ids.map((id) => [id, createHmac("sha256", secret).update(`results-csv:${sessionId}:${id}`).digest("hex")]),
  );
}
const IDS = ["uid-a", "uid-b", "uid-c", "uid-d", "uid-e"];

describe("assignCsvCodes (review H1)", () => {
  it("codes look like C-XXXX from the unambiguous alphabet", () => {
    const codes = assignCsvCodes(digests("k", "s1", IDS));
    for (const c of codes.values()) expect(c).toMatch(/^C-[A-HJKMNP-Z2-9]{4}$/);
  });

  it("the same cupper has a different code in another session", () => {
    const a = assignCsvCodes(digests("k", "s1", IDS));
    const b = assignCsvCodes(digests("k", "s2", IDS));
    expect(IDS.filter((id) => a.get(id) === b.get(id)).length).toBeLessThan(IDS.length);
  });

  it("is stable, and removing one participant changes nobody else's code", () => {
    const all = assignCsvCodes(digests("k", "s1", IDS));
    expect(assignCsvCodes(digests("k", "s1", IDS))).toEqual(all);
    const fewer = assignCsvCodes(digests("k", "s1", IDS.slice(1)));
    for (const id of IDS.slice(1)) expect(fewer.get(id)).toBe(all.get(id));
  });

  it("does not depend on the order cuppers are listed in", () => {
    const a = assignCsvCodes(digests("k", "s1", IDS));
    const b = assignCsvCodes(digests("k", "s1", [...IDS].reverse()));
    for (const id of IDS) expect(b.get(id)).toBe(a.get(id));
  });

  it("a different key gives different codes (the code is not derivable from the id)", () => {
    const a = assignCsvCodes(digests("k1", "s1", IDS));
    const b = assignCsvCodes(digests("k2", "s1", IDS));
    expect(IDS.some((id) => a.get(id) !== b.get(id))).toBe(true);
  });

  it("a collision lengthens only the colliding cuppers, deterministically", () => {
    // Same first 4 characters (8 hex), different continuation.
    const m = new Map([
      ["x", "aabbccdd" + "11".repeat(28)],
      ["y", "aabbccdd" + "22".repeat(28)],
      ["z", "01020304" + "33".repeat(28)],
    ]);
    const codes = assignCsvCodes(m);
    expect(new Set(codes.values()).size).toBe(3);
    expect(codes.get("x")).toHaveLength(2 + 5);
    expect(codes.get("y")).toHaveLength(2 + 5);
    expect(codes.get("z")).toHaveLength(2 + 4);
    expect(assignCsvCodes(m)).toEqual(codes);
  });
});
