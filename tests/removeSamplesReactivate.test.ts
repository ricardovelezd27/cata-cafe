import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// S8-27: source-level check (the helper needs a Prisma transaction).
describe("removeSamplesInTx callers choose onReactivate (source-level check)", () => {
  const calls = (file: string) =>
    [...readFileSync(file, "utf8").matchAll(/removeSamplesInTx\(([^;]*?)\);/g)].map((m) => m[1]);

  it("every caller passes an explicit onReactivate choice", () => {
    for (const f of ["app/actions/sessions.ts", "app/actions/community.ts"]) {
      const cs = calls(f);
      expect(cs.length).toBeGreaterThan(0);
      for (const c of cs) expect(c).toMatch(/onReactivate:\s*"(refuse|ignore)"/);
    }
  });

  it("removeSessionSample refuses, the solo finish ignores", () => {
    for (const c of calls("app/actions/sessions.ts")) expect(c).toContain('"refuse"');
    for (const c of calls("app/actions/community.ts")) expect(c).toContain('"ignore"');
  });
});
