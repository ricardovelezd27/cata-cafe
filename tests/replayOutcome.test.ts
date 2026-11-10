import { describe, expect, it } from "vitest";
import {
  MAX_AUTO_ATTEMPTS,
  applyOutcome,
  ALL_STATUSES,
  blocksSubmit,
  hydratesForm,
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
  it("pending and failed block submit; terminal, conflict and synced never do", () => {
    const expected = {
      pending: true,
      failed: true,
      synced: false,
      conflict: false,
      closed_unsent: false,
      orphaned: false,
    } as const;
    for (const s of ALL_STATUSES) expect(blocksSubmit(s)).toBe(expected[s]);
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

describe("hydratesForm", () => {
  it("hydrates pending and failed drafts only, for every status", () => {
    const expected: Record<string, boolean> = {
      pending: true,
      failed: true,
      synced: false,
      conflict: false,
      closed_unsent: false,
      orphaned: false,
    };
    expect(Object.keys(expected).sort()).toEqual([...ALL_STATUSES].sort());
    for (const s of ALL_STATUSES) expect(hydratesForm(s)).toBe(expected[s]);
  });
});
