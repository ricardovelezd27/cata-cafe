import { describe, expect, it } from "vitest";
import { exitMarksSeen, onCuppingStarted, shouldShowWarmupOverlay, skipNeedsConfirm, SKIP_SEEN_AFTER_MS, START_EXIT_CAP_MS } from "@/lib/warmup/overlayGate";

const base = {
  exerciseId: "eyes",
  seenValue: null,
  hasOwnEvaluation: false,
  isOwner: false,
  isGroup: true,
  isAsync: false,
  startedAt: false,
};

describe("shouldShowWarmupOverlay", () => {
  it.each([
    ["no exercise", { exerciseId: null }, false],
    ["unknown exercise id", { exerciseId: "yoga" }, false],
    ["already seen this exercise", { seenValue: "eyes" }, false],
    ["seen a different exercise → re-armed", { seenValue: "arm-raise" }, true],
    ["has an evaluation already", { hasOwnEvaluation: true }, false],
    ["owner of a live group session", { isOwner: true }, false],
    ["owner of an async group session", { isOwner: true, isAsync: true }, true],
    ["solo owner", { isOwner: true, isGroup: false }, true],
    ["live participant", {}, true],
    ["live participant after Iniciar cata", { startedAt: true }, false],
    ["live late joiner after start", { startedAt: true, hasOwnEvaluation: false }, false],
    ["async participant, startedAt set", { isAsync: true, startedAt: true }, true],
    ["solo, startedAt set", { isGroup: false, startedAt: true }, true],
    ["async participant", { isAsync: true }, true],
  ])("%s", (_name, patch, expected) => {
    expect(shouldShowWarmupOverlay({ ...base, ...patch })).toBe(expected);
  });
});

describe("leaving early", () => {
  it("marks seen only when completed or past 20 s", () => {
    expect(SKIP_SEEN_AFTER_MS).toBe(20000);
    expect(exitMarksSeen({ completed: false, elapsedMs: 0 })).toBe(false);
    expect(exitMarksSeen({ completed: false, elapsedMs: 19_999 })).toBe(false);
    expect(exitMarksSeen({ completed: false, elapsedMs: 20_000 })).toBe(true);
    expect(exitMarksSeen({ completed: true, elapsedMs: 5 })).toBe(true);
    expect(exitMarksSeen(undefined)).toBe(true);
  });
  it("asks for a confirm only when the skip would mark seen", () => {
    expect(skipNeedsConfirm({ completed: false, elapsedMs: 5_000 })).toBe(false);
    expect(skipNeedsConfirm({ completed: false, elapsedMs: 20_000 })).toBe(true);
    expect(skipNeedsConfirm({ completed: true, elapsedMs: 90_000 })).toBe(false);
  });
});

describe("onCuppingStarted", () => {
  it("pushes unless the player is mid-run", () => {
    expect(onCuppingStarted("closed")).toBe("push");
    expect(onCuppingStarted("intro")).toBe("push");
    expect(onCuppingStarted("ended")).toBe("push");
    expect(onCuppingStarted("run")).toBe("bar");
    expect(START_EXIT_CAP_MS).toBe(30000);
  });
});
