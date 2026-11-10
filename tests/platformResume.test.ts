import { describe, expect, it } from "vitest";
import { createResumeGate } from "@/lib/platform/resume";

function clock(start = 100_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("createResumeGate", () => {
  it("resumes after being hidden at least 2 s", () => {
    const c = clock();
    const g = createResumeGate({ now: c.now });
    g.hidden();
    c.advance(2500);
    expect(g.visible()).toBe("visible");
  });
  it("ignores a quick tab flick", () => {
    const c = clock();
    const g = createResumeGate({ now: c.now });
    g.hidden();
    c.advance(500);
    expect(g.visible()).toBeNull();
  });
  it("ignores visible without a prior hidden", () => {
    const g = createResumeGate({ now: clock().now });
    expect(g.visible()).toBeNull();
  });
  it("fires on online, and dedupes a visibility+online burst within 1 s", () => {
    const c = clock();
    const g = createResumeGate({ now: c.now });
    g.hidden();
    c.advance(5000);
    expect(g.visible()).toBe("visible");
    c.advance(300);
    expect(g.online()).toBeNull();
    c.advance(1500);
    expect(g.online()).toBe("online");
  });
  it("honours a custom threshold", () => {
    const c = clock();
    const g = createResumeGate({ now: c.now, minHiddenMs: 10_000 });
    g.hidden();
    c.advance(5000);
    expect(g.visible()).toBeNull();
    g.hidden();
    c.advance(10_000);
    expect(g.visible()).toBe("visible");
  });
});
