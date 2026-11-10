import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertSessionWritable } from "@/lib/sessionState";

// S8-22 A-05: updateSampleMetadata's own session lookup must carry closesAt.
describe("updateSampleMetadata expiry (A-05)", () => {
  const NOW = Date.parse("2026-10-20T12:00:00Z");

  it("a label edit on an expired but not-yet-closed session throws session_closed", () => {
    const row = { status: "active", closesAt: new Date(NOW - 1000) };
    expect(() => assertSessionWritable(row, NOW)).toThrow("session_closed");
  });

  it("the same row without closesAt is judged on status alone (the bug)", () => {
    expect(() => assertSessionWritable({ status: "active" }, NOW)).not.toThrow();
  });

  it("the lookup selects closesAt and the sanctioned post-close rule is unchanged", () => {
    const src = readFileSync("app/actions/sessions.ts", "utf8");
    const i = src.indexOf("session: { select: { createdBy: true, status: true, closesAt: true } }");
    expect(i).toBeGreaterThan(-1);
    expect(src).toContain(
      "isSessionClosed(sample.session) && sample.coffeeId === null && hasAnyCoffeeField(input)",
    );
    expect(src).toContain("if (!postCloseNaming) assertSessionWritable(sample.session);");
  });
});
