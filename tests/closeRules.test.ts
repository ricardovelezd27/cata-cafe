import { describe, expect, it } from "vitest";
import {
  DRAFT_AT_CLOSE,
  countUnsentComplete,
  deadlineReminderWindow,
  deadlineState,
  isEvaluationComplete,
  isLiveIdle,
  LIVE_IDLE_MS,
  planFinish,
} from "@/lib/closeRules";
import { CUPPING_STEPS, STEP_ATTRIBUTES } from "@/lib/constants";

function completeAffective(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const step of CUPPING_STEPS) {
    for (const a of STEP_ATTRIBUTES[step]) out[`${a.affectiveId}_final`] = 6;
  }
  return out;
}

const row = (cupperId: string, isDraft: boolean, affectiveData: unknown) => ({
  cupperId,
  isDraft,
  affectiveData,
  descriptiveData: {},
  combinedData: {},
});

describe("DRAFT_AT_CLOSE", () => {
  it("defaults to Kim's C1 option b (exclude)", () => {
    expect(DRAFT_AT_CLOSE).toBe("exclude");
  });
});

describe("isEvaluationComplete / countUnsentComplete", () => {
  it("a full affective row is complete, a partial or empty one is not", () => {
    expect(isEvaluationComplete(row("a", true, completeAffective()), "affective")).toBe(true);
    expect(isEvaluationComplete(row("a", true, { fragancia_af_final: 5 }), "affective")).toBe(false);
    expect(isEvaluationComplete(row("a", true, null), "affective")).toBe(false);
  });

  it("counts distinct cuppers and drafts, ignoring submitted and partial rows", () => {
    const full = completeAffective();
    const rows = [
      row("a", true, full),
      row("a", true, full),
      row("b", true, { fragancia_af_final: 5 }),
      row("c", false, full),
      row("d", true, full),
    ];
    expect(countUnsentComplete(rows, "affective")).toEqual({ cuppers: 2, evaluations: 3 });
  });

  it("is zero for no rows", () => {
    expect(countUnsentComplete([], "combined")).toEqual({ cuppers: 0, evaluations: 0 });
  });
});

describe("deadlineState", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("none without a date", () => {
    expect(deadlineState(null, now)).toBe("none");
    expect(deadlineState(undefined, now)).toBe("none");
  });
  it("open beyond 24 h, soon within 24 h, passed after", () => {
    expect(deadlineState(new Date(now + 25 * 3_600_000), now)).toBe("open");
    expect(deadlineState(new Date(now + 24 * 3_600_000), now)).toBe("soon");
    expect(deadlineState(new Date(now + 1000), now)).toBe("soon");
    expect(deadlineState(new Date(now - 1), now)).toBe("passed");
  });
});

describe("deadlineReminderWindow", () => {
  it("is (now, now + 24 h]", () => {
    const w = deadlineReminderWindow(1_000_000);
    expect(w.gt.getTime()).toBe(1_000_000);
    expect(w.lte.getTime()).toBe(1_000_000 + 24 * 3_600_000);
  });
});

describe("isLiveIdle", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const base = {
    isGroup: true,
    isAsync: false,
    closesAt: null,
    status: "active",
    startedAt: new Date(now - LIVE_IDLE_MS - 1),
  };
  it("idle once the start is older than the window and nobody evaluated", () => {
    expect(isLiveIdle(base, null, now)).toBe(true);
  });
  it("a recent evaluation keeps it alive", () => {
    expect(isLiveIdle(base, new Date(now - 1000), now)).toBe(false);
  });
  it("never for async, dated, closed, solo or unstarted sessions", () => {
    expect(isLiveIdle({ ...base, isAsync: true }, null, now)).toBe(false);
    expect(isLiveIdle({ ...base, closesAt: new Date(now + 1) }, null, now)).toBe(false);
    expect(isLiveIdle({ ...base, status: "closed" }, null, now)).toBe(false);
    expect(isLiveIdle({ ...base, isGroup: false }, null, now)).toBe(false);
    expect(isLiveIdle({ ...base, startedAt: null }, null, now)).toBe(false);
  });
});

describe("planFinish (F-express-1, F-solo-3)", () => {
  it("6 created, 4 submitted: removes the 2 never opened, finishes with 4", () => {
    const samples = [
      ...[1, 2, 3, 4].map((i) => ({ id: `s${i}`, evaluation: { isDraft: false, complete: true } })),
      { id: "s5", evaluation: null },
      { id: "s6", evaluation: null },
    ];
    const p = planFinish(samples);
    expect(p.removeIds).toEqual(["s5", "s6"]);
    expect(p.submitIds).toEqual([]);
    expect(p.scoredCount).toBe(4);
    expect(p.canFinish).toBe(true);
  });

  it("submits complete drafts, keeps partial ones and never removes a sample with an evaluation", () => {
    const p = planFinish([
      { id: "a", evaluation: { isDraft: true, complete: true } },
      { id: "b", evaluation: { isDraft: true, complete: false } },
      { id: "c", evaluation: null },
    ]);
    expect(p.submitIds).toEqual(["a"]);
    expect(p.keptPartialIds).toEqual(["b"]);
    expect(p.removeIds).toEqual(["c"]);
    expect(p.removeIds).not.toContain("b");
    expect(p.scoredCount).toBe(1);
  });

  it("cannot finish with nothing scored", () => {
    const p = planFinish([
      { id: "a", evaluation: { isDraft: true, complete: false } },
      { id: "b", evaluation: null },
    ]);
    expect(p.canFinish).toBe(false);
  });
});
