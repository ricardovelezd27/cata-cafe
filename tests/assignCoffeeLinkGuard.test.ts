import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S8-10 review: the create-and-link transaction in updateSampleMetadata must
// link with a `coffeeId: null` guard and roll back (conflict) when a concurrent
// call already linked, else two calls orphan a coffee. Static scan (no Prisma).
describe("updateSampleMetadata create+link guard", () => {
  const src = readFileSync(join(process.cwd(), "app", "actions", "sessions.ts"), "utf8");
  const start = src.indexOf("export async function updateSampleMetadata");
  const body = src.slice(start, src.indexOf("\nexport ", start + 10));

  it("links with updateMany guarded by coffeeId: null", () => {
    expect(body).toMatch(/tx\.sessionSample\.updateMany\(\{\s*where: \{ id: sampleId, coffeeId: null \}/);
  });
  it("throws conflict on count 0 and does not retry it", () => {
    expect(body).toMatch(/\.count === 0\) throw new Error\("conflict"\)/);
    expect(body).toContain("!isCoffeeCodeCollision(err)");
  });
});
