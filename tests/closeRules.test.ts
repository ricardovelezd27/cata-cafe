import { describe, expect, it } from "vitest";
import {
  DRAFT_AT_CLOSE,
  countUnsentComplete,
  deadlineReminderWindow,
  deadlineState,
  isEvaluationComplete,
  isLiveAbandoned,
  isLiveIdle,
  LIVE_AUTO_CLOSE_MS,
  LIVE_IDLE_MS,
  planFinish,
} from "@/lib/closeRules";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";

function completeAffective(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of AFFECTIVE_ATTRIBUTES) out[`${a.id}_final`] = 6;
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
    expect(isEvaluationComplete(row("a", true, { [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: 5 }), "affective")).toBe(false);
    expect(isEvaluationComplete(row("a", true, null), "affective")).toBe(false);
  });

  it("counts distinct cuppers and drafts, ignoring submitted and partial rows", () => {
    const full = completeAffective();
    const rows = [
      row("a", true, full),
      row("a", true, full),
      row("b", true, { [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: 5 }),
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

describe("live idle windows (Kim C3, TODO(kim-validar:C3))", () => {
  it("the reminder is at 24 h and the automatic close at 7 days", () => {
    expect(LIVE_IDLE_MS).toBe(24 * 3_600_000);
    expect(LIVE_AUTO_CLOSE_MS).toBe(7 * 24 * 3_600_000);
  });
});

describe("isLiveAbandoned", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const base = {
    isGroup: true,
    isAsync: false,
    closesAt: null,
    status: "active",
    startedAt: new Date(now - LIVE_AUTO_CLOSE_MS),
  };
  it("abandoned exactly at 7 days since the start with no evaluation", () => {
    expect(isLiveAbandoned(base, null, now)).toBe(true);
  });
  it("not abandoned one millisecond before 7 days", () => {
    expect(isLiveAbandoned({ ...base, startedAt: new Date(now - LIVE_AUTO_CLOSE_MS + 1) }, null, now)).toBe(false);
  });
  it("the last evaluation resets the clock, also at the boundary", () => {
    expect(isLiveAbandoned(base, new Date(now - LIVE_AUTO_CLOSE_MS + 1), now)).toBe(false);
    expect(isLiveAbandoned(base, new Date(now - LIVE_AUTO_CLOSE_MS - 5000), now)).toBe(true);
  });
  it("an old evaluation does not predate the start", () => {
    expect(isLiveAbandoned(base, new Date(now - 30 * 24 * 3_600_000), now)).toBe(true);
  });
  it("never for async, dated, closed, solo or unstarted sessions", () => {
    expect(isLiveAbandoned({ ...base, isAsync: true }, null, now)).toBe(false);
    expect(isLiveAbandoned({ ...base, closesAt: new Date(now + 1) }, null, now)).toBe(false);
    expect(isLiveAbandoned({ ...base, status: "closed" }, null, now)).toBe(false);
    expect(isLiveAbandoned({ ...base, isGroup: false }, null, now)).toBe(false);
    expect(isLiveAbandoned({ ...base, startedAt: null }, null, now)).toBe(false);
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

  it("keeps (unscored) a never-opened sample that holds physical or extrinsic data", () => {
    const p = planFinish([
      { id: "a", evaluation: { isDraft: false, complete: true } },
      { id: "b", evaluation: null, hasOtherData: true },
      { id: "c", evaluation: null },
    ]);
    expect(p.removeIds).toEqual(["c"]);
    expect(p.keptPartialIds).toEqual(["b"]);
  });

  it("a reference as the only scored sample cannot finish", () => {
    const only = planFinish([
      { id: "r", evaluation: { isDraft: true, complete: true }, isReference: true },
      { id: "x", evaluation: null },
    ]);
    expect(only.canFinish).toBe(false);
    const withOther = planFinish([
      { id: "r", evaluation: { isDraft: false, complete: true }, isReference: true },
      { id: "x", evaluation: { isDraft: true, complete: true } },
    ]);
    expect(withOther.canFinish).toBe(true);
  });
});

import { ON_VIEW_REPAIR_GRACE_MS, soloRepairOwedOnView } from "@/lib/closeRules";

describe("soloRepairOwedOnView (S8-21)", () => {
  const base = {
    status: "closed",
    isGroup: false,
    createdBy: "u1",
    closedAt: new Date(),
    closeFinalizedAt: null,
  };
  it("owes a repair to the solo owner of a closed, unfinalized session", () => {
    const now = Date.now();
    const closedAgo = (ms: number) => ({ ...base, closedAt: new Date(now - ms) });
    expect(soloRepairOwedOnView(closedAgo(25_000), "u1", ON_VIEW_REPAIR_GRACE_MS, now)).toBe(true);
  });
  it("respects the grace so it never overlaps a close in flight", () => {
    const now = Date.now();
    const closedAgo = (ms: number) => ({ ...base, closedAt: new Date(now - ms) });
    expect(soloRepairOwedOnView(closedAgo(5_000), "u1", ON_VIEW_REPAIR_GRACE_MS, now)).toBe(false);
    expect(soloRepairOwedOnView(closedAgo(19_999), "u1", ON_VIEW_REPAIR_GRACE_MS, now)).toBe(false);
    expect(soloRepairOwedOnView(closedAgo(20_000), "u1", ON_VIEW_REPAIR_GRACE_MS, now)).toBe(true);
    expect(ON_VIEW_REPAIR_GRACE_MS).toBe(20_000);
  });
  it("never for group sessions, other viewers, finalized or active sessions", () => {
    expect(soloRepairOwedOnView({ ...base, isGroup: true }, "u1")).toBe(false);
    expect(soloRepairOwedOnView(base, "u2")).toBe(false);
    expect(soloRepairOwedOnView({ ...base, closeFinalizedAt: new Date() }, "u1")).toBe(false);
    expect(soloRepairOwedOnView({ ...base, status: "active" }, "u1")).toBe(false);
  });
});
