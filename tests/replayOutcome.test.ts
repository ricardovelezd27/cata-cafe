import { describe, expect, it } from "vitest";
import {
  MAX_AUTO_ATTEMPTS,
  applyOutcome,
  blocksSubmit,
  isTerminal,
  isUnsynced,
  reviveFailed,
  statusForOutcome,
} from "@/lib/offline/status";
import type { OfflineModuleData } from "@/lib/offline/types";

const mod = (over: Partial<OfflineModuleData> = {}): OfflineModuleData => ({
  data: { a: 1 },
  syncStatus: "pending",
  updatedAt: 100,
  ...over,
});

describe("statusForOutcome", () => {
  it("maps every server answer to one status", () => {
    expect(statusForOutcome("synced", 3).status).toBe("synced");
    expect(statusForOutcome("conflict", 0).status).toBe("conflict");
    expect(statusForOutcome("closed", 0).status).toBe("closed_unsent");
    expect(statusForOutcome("gone", 0).status).toBe("orphaned");
    expect(statusForOutcome("rejected", 0).status).toBe("orphaned");
  });

  it("counts retries and parks the module as failed at the cap", () => {
    expect(statusForOutcome("retry", 0)).toEqual({ status: "pending", attempts: 1 });
    expect(statusForOutcome("retry", MAX_AUTO_ATTEMPTS - 2).status).toBe("pending");
    expect(statusForOutcome("retry", MAX_AUTO_ATTEMPTS - 1)).toEqual({
      status: "failed",
      attempts: MAX_AUTO_ATTEMPTS,
    });
  });
});

describe("status predicates", () => {
  it("only pending blocks submit; terminal statuses never do", () => {
    expect(blocksSubmit("pending")).toBe(true);
    for (const s of ["failed", "orphaned", "closed_unsent", "conflict", "synced"] as const) {
      expect(blocksSubmit(s)).toBe(false);
    }
  });
  it("terminal and unsynced sets", () => {
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("conflict")).toBe(false);
    expect(isUnsynced("synced")).toBe(false);
    expect(isUnsynced("orphaned")).toBe(true);
  });
});

describe("applyOutcome", () => {
  it("keeps the data on every outcome (a draft is never dropped)", () => {
    for (const o of ["synced", "conflict", "closed", "gone", "rejected", "retry"] as const) {
      expect(applyOutcome(mod(), o)?.data).toEqual({ a: 1 });
    }
  });
  it("schedules the next attempt only while pending", () => {
    const r = applyOutcome(mod(), "retry", { now: 1000 });
    expect(r?.syncStatus).toBe("pending");
    expect(r?.nextAttemptAt).toBeGreaterThan(1000);
    const done = applyOutcome(mod({ nextAttemptAt: 5 }), "gone");
    expect(done?.nextAttemptAt).toBeUndefined();
  });
  it("revives failed modules for a manual retry", () => {
    const failed = mod({ syncStatus: "failed", attempts: 5 });
    expect(reviveFailed(failed)).toMatchObject({ syncStatus: "pending", attempts: 0 });
    const ok = mod();
    expect(reviveFailed(ok)).toBe(ok);
  });
});
