import { describe, expect, it } from "vitest";
import { createGovernor } from "@/components/landing/journey/governor";

const opts = { budgetMs: 8, windowSize: 10, warmupFrames: 5, maxDowngrades: 2 };

function feed(g: ReturnType<typeof createGovernor>, ms: number, n: number) {
  let last: ReturnType<typeof g.sample> = "keep";
  for (let i = 0; i < n; i++) last = g.sample(ms);
  return last;
}

describe("governor", () => {
  it("never decides during warm-up, even when slow", () => {
    const g = createGovernor(opts);
    for (let i = 0; i < 5; i++) expect(g.sample(50)).toBe("keep");
  });

  it("keeps when the mean draw cost is within budget", () => {
    const g = createGovernor(opts);
    feed(g, 1, 5); // warm-up
    const decisions = new Set<string>();
    for (let i = 0; i < 40; i++) decisions.add(g.sample(6));
    expect([...decisions]).toEqual(["keep"]);
    expect(g.meanMs).toBeCloseTo(6, 5);
  });

  it("evaluates once per full window, not on every frame", () => {
    const g = createGovernor(opts);
    feed(g, 1, 5);
    const out: string[] = [];
    for (let i = 0; i < 10; i++) out.push(g.sample(20));
    expect(out.slice(0, 9)).toEqual(Array(9).fill("keep"));
    expect(out[9]).toBe("downgrade");
  });

  it("downgrades at most maxDowngrades times, then kills", () => {
    const g = createGovernor(opts);
    feed(g, 1, 5);
    expect(feed(g, 20, 10)).toBe("downgrade");
    expect(g.downgrades).toBe(1);
    expect(feed(g, 20, 10)).toBe("downgrade");
    expect(g.downgrades).toBe(2);
    expect(feed(g, 20, 10)).toBe("kill");
    expect(g.killed).toBe(true);
    expect(g.sample(20)).toBe("kill");
  });

  it("a slow window followed by fast windows does not accumulate", () => {
    const g = createGovernor(opts);
    feed(g, 1, 5);
    expect(feed(g, 20, 10)).toBe("downgrade");
    expect(feed(g, 2, 10)).toBe("keep");
    expect(feed(g, 2, 10)).toBe("keep");
    expect(g.downgrades).toBe(1);
  });

  it("scales the live count by 60 % per downgrade with a floor", () => {
    const g = createGovernor(opts);
    expect(g.liveFor(1600)).toBe(1600);
    feed(g, 1, 5);
    feed(g, 20, 10);
    expect(g.liveFor(1600)).toBe(960);
    feed(g, 20, 10);
    expect(g.liveFor(1600)).toBe(576);
    expect(g.liveFor(50)).toBe(50); // never below the floor or the total
  });
});
