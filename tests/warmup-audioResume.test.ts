import { describe, expect, it } from "vitest";
import { audioResumeDecision, type AudioCtxState } from "@/lib/warmup/audioResume";

const base = { ctxState: "running" as AudioCtxState, muted: false, running: true, interrupted: false };

describe("audioResumeDecision", () => {
  it.each([
    ["healthy run", {}, "ok"],
    ["suspended after lock", { ctxState: "suspended" }, "prompt"],
    ["interrupted state but flag not yet set", { ctxState: "interrupted" }, "prompt"],
    ["suspended but muted", { ctxState: "suspended", muted: true }, "ok"],
    ["suspended but not running", { ctxState: "suspended", running: false }, "ok"],
    ["interrupted pause already took over", { ctxState: "suspended", interrupted: true }, "ok"],
    ["closed context", { ctxState: "closed" }, "ok"],
    ["no context at all", { ctxState: "none" }, "ok"],
  ] as [string, Partial<typeof base>, string][])("%s", (_n, patch, expected) => {
    expect(audioResumeDecision({ ...base, ...patch })).toBe(expected);
  });
});
