import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// S8-21 review: the results page's on-view repair of a solo close must go
// through closeSessionInternal (the ONLY thing that flips a session to closed),
// never send emails, and never write `status` itself.

const PAGE = path.join(
  process.cwd(),
  "app",
  "[locale]",
  "app",
  "sessions",
  "[id]",
  "results",
  "page.tsx",
);
const source = fs.readFileSync(PAGE, "utf8");

describe("results page on-view repair", () => {
  it("calls closeSessionInternal with emails: \"skip\"", () => {
    const m = source.match(/closeSessionInternal\s*\(\s*id\s*,\s*\{([^}]*)\}/);
    expect(m, "closeSessionInternal call not found").not.toBeNull();
    expect(m![1]).toMatch(/emails:\s*"skip"/);
    expect(m![1]).toMatch(/reason:\s*"repair"/);
  });

  it("uses the on-view grace constant, not zero", () => {
    expect(source).toMatch(/repairGraceMs:\s*ON_VIEW_REPAIR_GRACE_MS/);
    expect(source).not.toMatch(/repairGraceMs:\s*0\b/);
  });

  it("never writes status itself", () => {
    expect(source).not.toMatch(/\bstatus\s*:\s*["']closed["']/);
    expect(source).not.toMatch(/\.(update|updateMany|upsert)\s*\(/);
  });
});
