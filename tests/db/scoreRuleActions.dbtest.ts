// S10 WP1a review: two actions that must respect the rule a stored score was
// computed under, run against Postgres (real trigger PHASE 26).
//  - H1: refreshAggregateScores on a CLOSED session never rewrites a past score.
//  - M3: a draft saved before the deploy (cups NULL) submitted after it is
//    recomputed under the current rule before the trigger fires.
// Only external boundaries are mocked (auth user, next cache/server, Supabase admin).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: h.userId, is_anonymous: false }),
  requireRegisteredUser: async () => ({ id: h.userId, is_anonymous: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: {} } }) }));

import { refreshAggregateScores, submitAllEvaluations } from "@/app/actions/community";
import { computeGroupAggregate, calcIndividualScore } from "@/lib/scoring";
import {
  affectiveData,
  makeEvaluation,
  makeSession,
  makeUser,
  prisma,
  resetDb,
  storedAggregate,
} from "./support/db";

beforeEach(resetDb);

describe("refreshAggregateScores (review H1)", () => {
  it("leaves a closed session with an old-rule sample untouched (score, ruleVersion, computedAt)", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const u1 = await makeUser({ name: "Uno" });
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
    });
    const A = s.samples[0];
    // Old-style rows: cups NULL; the flagged cup costs nothing under the old rule below five cups.
    for (const cupper of [owner, u1]) {
      await makeEvaluation({
        sampleId: A.id,
        sessionId: s.id,
        cupperId: cupper,
        cupsPerSample: 2,
        values: 7,
        nonUniform: [true, false],
        defective: [true, false],
        overrides: { cups: null },
      });
    }
    // Pin the stored aggregate to what the OLD function would have written, then close.
    await prisma.aggregateScore.update({
      where: { sessionSampleId: A.id },
      data: { ruleVersion: 1, communityScore: 80.25, computedAt: new Date("2026-11-01T12:00:00Z") },
    });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z") },
    });
    const before = await storedAggregate(A.id);

    h.userId = owner;
    await refreshAggregateScores(s.id);

    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(1);
    expect(after?.communityScore).toBe(before?.communityScore);
    expect(after?.computedAt.getTime()).toBe(before?.computedAt.getTime());
  });

  it("still re-fires an OPEN session (stamps ruleVersion 2)", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, cupsPerSample: 5 });
    const A = s.samples[0];
    await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: owner, values: 7 });
    await prisma.aggregateScore.update({ where: { sessionSampleId: A.id }, data: { ruleVersion: 1 } });
    h.userId = owner;
    await refreshAggregateScores(s.id);
    expect((await storedAggregate(A.id))?.ruleVersion).toBe(2);
  });
});

describe("submitAllEvaluations (review M3)", () => {
  it("recomputes a pre-deploy draft (cups NULL) under the current rule before the trigger fires", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const s = await makeSession({ ownerId: owner, isGroup: false, cupsPerSample: 3 });
    const A = s.samples[0];
    // Draft as the OLD code stored it: no `cups`, and an individual score without the deduction.
    const data = {
      ...affectiveData(7),
      tazas_no_uniformes: [true, false, false],
      tazas_defectuosas: [true, false, false],
    };
    await makeEvaluation({
      sampleId: A.id,
      sessionId: s.id,
      cupperId: owner,
      cupsPerSample: 3,
      data,
      draft: true,
      nonUniform: [true, false, false],
      defective: [true, false, false],
      overrides: { cups: null },
    });
    // The old code would have stored the undeducted score; make that explicit.
    const undeducted = calcIndividualScore(data, 3, { rule: "v1" });
    await prisma.evaluation.update({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
      data: { individualScore: undeducted as number },
    });

    h.userId = owner;
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);

    const ev = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
    });
    expect(ev.isDraft).toBe(false);
    expect(ev.cups).toBe(3);
    const expected = calcIndividualScore(data, 3);
    expect(ev.individualScore).toBe(expected);
    expect(ev.individualScore).toBeLessThan(undeducted as number);

    const agg = await storedAggregate(A.id);
    expect(agg?.ruleVersion).toBe(2);
    const ts = computeGroupAggregate(
      [{ data: ev.affectiveData as Record<string, unknown>, nonUniformCups: ev.nonUniformCups, defectiveCups: ev.defectiveCups, cups: ev.cups ?? undefined }],
      3,
    );
    expect(agg?.communityScore).toBe(ts.communityScore);
  });
});
