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
  requireUserExpecting: async () => ({ id: h.userId, is_anonymous: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin: {} } }) }));

import {
  finishSoloSession,
  refreshAggregateScores,
  setParticipantExclusion,
  submitAllEvaluations,
} from "@/app/actions/community";
import { closeSessionInternal, finalizeClosedSession } from "@/lib/closeSession";
import { hasLegacyDrafts, recomputeLegacyDraftsInTx } from "@/lib/legacyDrafts";
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

// ── Second review additions ─────────────────────────────────────────────────

const OLD_AT = new Date("2026-11-01T12:00:00Z");

/** A submitted evaluation as the OLD code stored it (cups NULL), aggregate pinned to the old function's output. */
async function oldRuleSample(args: { sessionId: string; sampleId: string; cuppers: string[]; cups: number }) {
  for (const cupper of args.cuppers) {
    await makeEvaluation({
      sampleId: args.sampleId,
      sessionId: args.sessionId,
      cupperId: cupper,
      cupsPerSample: args.cups,
      values: 7,
      nonUniform: [true, ...Array<boolean>(args.cups - 1).fill(false)],
      defective: [true, ...Array<boolean>(args.cups - 1).fill(false)],
      overrides: { cups: null },
    });
  }
  await prisma.aggregateScore.update({
    where: { sessionSampleId: args.sampleId },
    data: { ruleVersion: 1, communityScore: 80.25, computedAt: OLD_AT },
  });
}

describe("close routine never rewrites pre-deploy samples (second review H1)", () => {
  it("(a) a closed, unfinalized session of all-old data is repaired (reveal, history, stamp) and its aggregates are byte-identical", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const u1 = await makeUser({ name: "Uno" });
    const coffee = await prisma.coffee.create({
      data: { name: "Huila", createdBy: owner, country: "Colombia", visibility: "private" },
    });
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
      samples: [{ label: "A", coffeeId: coffee.id, revealed: false }],
    });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z"), closeFinalizedAt: null },
    });
    const before = await storedAggregate(A.id);

    const r = await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });
    expect(r.finalized).toBe(true);

    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.closeFinalizedAt).toBeInstanceOf(Date);
    expect((await prisma.sessionSample.findUniqueOrThrow({ where: { id: A.id } })).revealed).toBe(true);
    expect(await prisma.userCoffeeHistory.count({ where: { coffeeId: coffee.id } })).toBe(2);
    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(1);
    expect(after?.communityScore).toBe(before?.communityScore);
    expect(after?.computedAt.getTime()).toBe(before?.computedAt.getTime());
  });

  it("(b) with one evaluation that has cups set, only THAT sample is re-fired", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
      samples: [{ label: "A" }, { label: "B" }],
    });
    const [A, B] = s.samples;
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    await oldRuleSample({ sessionId: s.id, sampleId: B.id, cuppers: [owner], cups: 2 });
    // One evaluation of B written by the new code (cups set).
    await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, values: 7 });
    // The insert fired the trigger for B; pin B back to "old stored" so the re-fire is observable.
    await prisma.aggregateScore.update({
      where: { sessionSampleId: B.id },
      data: { ruleVersion: 1, communityScore: 80.25, computedAt: OLD_AT },
    });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z") },
    });
    const beforeA = await storedAggregate(A.id);

    await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });

    const afterA = await storedAggregate(A.id);
    expect(afterA?.ruleVersion).toBe(1);
    expect(afterA?.computedAt.getTime()).toBe(beforeA?.computedAt.getTime());
    const afterB = await storedAggregate(B.id);
    expect(afterB?.ruleVersion).toBe(2);
    expect(afterB?.computedAt.getTime()).toBeGreaterThan(OLD_AT.getTime());
  });

  it("(c) the first close of a session opened before the deploy leaves its aggregates untouched", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: false, cupsPerSample: 2 });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner], cups: 2 });
    const before = await storedAggregate(A.id);

    const r = await closeSessionInternal(s.id, { reason: "solo_auto", emails: "skip", repairGraceMs: 0 });
    expect(r).toMatchObject({ closed: true, finalized: true });

    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(1);
    expect(after?.communityScore).toBe(before?.communityScore);
    expect(after?.computedAt.getTime()).toBe(before?.computedAt.getTime());
  });

  it("(d) the owner's exclusion still recomputes the whole sample (ruleVersion 2)", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 2 });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z") },
    });

    h.userId = owner;
    const r = await setParticipantExclusion(s.id, u1, true, "other", "test reason");
    expect(r.ok).toBe(true);

    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(2);
    expect(after?.participantCount).toBe(1);
    expect(after?.computedAt.getTime()).toBeGreaterThan(OLD_AT.getTime());
  });

  // Third review M-B: the two conditions of the keep-old-rule filter that no test pinned.
  it("(e) an all-old sample WITHOUT an aggregate row gets no first score at close, and the session still finalizes", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const u1 = await makeUser({ name: "Uno" });
    const coffee = await prisma.coffee.create({
      data: { name: "Nariño", createdBy: owner, country: "Colombia", visibility: "private" },
    });
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
      samples: [{ label: "A", coffeeId: coffee.id, revealed: false }],
    });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    // Shape of a sample whose aggregate row was never written (or lost): evaluations submitted, no row.
    await prisma.aggregateScore.delete({ where: { sessionSampleId: A.id } });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z"), closeFinalizedAt: null },
    });
    expect(await storedAggregate(A.id)).toBeNull();

    const r = await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });
    expect(r.finalized).toBe(true);

    // No first score under the new rule was written by the close pass ...
    expect(await prisma.aggregateScore.count({ where: { sessionSampleId: A.id } })).toBe(0);
    // ... and the rest of the finalize ran (reveal, history, stamp).
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.closeFinalizedAt).toBeInstanceOf(Date);
    expect((await prisma.sessionSample.findUniqueOrThrow({ where: { id: A.id } })).revealed).toBe(true);
    expect(await prisma.userCoffeeHistory.count({ where: { coffeeId: coffee.id } })).toBe(2);
  });

  it("(f) an aggregate row already at ruleVersion 2 is re-fired even when every evaluation is old (cups NULL)", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 2 });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    await prisma.aggregateScore.update({
      where: { sessionSampleId: A.id },
      data: { ruleVersion: 2, communityScore: 70, computedAt: OLD_AT },
    });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { status: "closed", closedAt: new Date("2026-11-02T12:00:00Z"), closeFinalizedAt: null },
    });

    await finalizeClosedSession(s.id, { reason: "repair", emails: "skip" });

    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(2);
    expect(after?.computedAt.getTime()).toBeGreaterThan(OLD_AT.getTime());
    expect(after?.communityScore).not.toBe(70);
  });
});

describe("legacy drafts (review L8, L9)", () => {
  const flagged = (cups: number) => ({
    ...affectiveData(7),
    tazas_no_uniformes: [true, ...Array<boolean>(cups - 1).fill(false)],
    tazas_defectuosas: [true, ...Array<boolean>(cups - 1).fill(false)],
  });
  const legacyDraft = (args: { sessionId: string; sampleId: string; cupperId: string; cups: number }) =>
    makeEvaluation({
      sampleId: args.sampleId,
      sessionId: args.sessionId,
      cupperId: args.cupperId,
      cupsPerSample: args.cups,
      data: flagged(args.cups),
      draft: true,
      nonUniform: [true, ...Array<boolean>(args.cups - 1).fill(false)],
      defective: [true, ...Array<boolean>(args.cups - 1).fill(false)],
      overrides: { cups: null },
    });
  const get = (sampleId: string, cupperId: string) =>
    prisma.evaluation.findUniqueOrThrow({ where: { sessionSampleId_cupperId: { sessionSampleId: sampleId, cupperId } } });

  it("finishSoloSession recomputes a legacy draft before closing", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, cupsPerSample: 3, samples: [{ label: "A" }, { label: "B" }] });
    const [A] = s.samples;
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: owner, cups: 3 });
    await prisma.evaluation.update({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: owner } },
      data: { individualScore: calcIndividualScore(flagged(3), 3, { rule: "v1" }) as number },
    });

    h.userId = owner;
    const r = await finishSoloSession(s.id);
    expect(r.ok).toBe(true);

    const ev = await get(A.id, owner);
    expect(ev.isDraft).toBe(false);
    expect(ev.cups).toBe(3);
    expect(ev.individualScore).toBe(calcIndividualScore(flagged(3), 3));
    expect((await storedAggregate(A.id))?.ruleVersion).toBe(2);
  });

  it("a group submit recomputes a legacy draft of the submitting cupper only", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 3 });
    const A = s.samples[0];
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: u1, cups: 3 });
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: owner, cups: 3 });

    h.userId = u1;
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);

    const mine = await get(A.id, u1);
    expect(mine.isDraft).toBe(false);
    expect(mine.cups).toBe(3);
    expect(mine.individualScore).toBe(calcIndividualScore(flagged(3), 3));
    const theirs = await get(A.id, owner);
    expect(theirs.isDraft).toBe(true);
    expect(theirs.cups).toBeNull();
  });

  it("the pinned reference still scores exactly 79.00 after the recompute", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, cupsPerSample: 3, samples: [{ label: "A" }, { label: "B" }] });
    const [A, B] = s.samples;
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: A.id } });
    // Old draft of the reference carrying unpinned values and flagged cups.
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: owner, cups: 3 });
    await legacyDraft({ sessionId: s.id, sampleId: B.id, cupperId: owner, cups: 3 });

    h.userId = owner;
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);

    const ref = await get(A.id, owner);
    expect(ref.cups).toBe(3);
    expect(ref.individualScore).toBe(79);
    const other = await get(B.id, owner);
    expect(other.individualScore).toBe(calcIndividualScore(flagged(3), 3));
  });

  it("a FREE-mode reference is NOT pinned by the legacy-draft recompute (B1)", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, cupsPerSample: 3, samples: [{ label: "A" }, { label: "B" }] });
    const [A] = s.samples;
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    await prisma.cuppingSession.update({
      where: { id: s.id },
      data: { referenceSampleId: A.id, referenceMode: "free" },
    });
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: owner, cups: 3 });

    h.userId = owner;
    const r = await submitAllEvaluations(s.id);
    expect(r.ok).toBe(true);

    const ref = await get(A.id, owner);
    expect(ref.cups).toBe(3);
    expect(ref.individualScore).toBe(calcIndividualScore(flagged(3), 3));
    expect(ref.individualScore).not.toBe(79);
  });

  it("refreshAggregateScores skips an expired-but-not-closed session", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 2,
      closesAt: new Date(Date.now() - 60_000),
    });
    const A = s.samples[0];
    await oldRuleSample({ sessionId: s.id, sampleId: A.id, cuppers: [owner, u1], cups: 2 });
    const before = await storedAggregate(A.id);

    h.userId = owner;
    await refreshAggregateScores(s.id);

    const after = await storedAggregate(A.id);
    expect(after?.ruleVersion).toBe(1);
    expect(after?.computedAt.getTime()).toBe(before?.computedAt.getTime());
  });

  it("a row an autosave rewrote between the read and the write is not overwritten (third review L-1)", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 3 });
    const [A] = s.samples;
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: u1, cups: 3 });
    const newer = { ...affectiveData(9), tazas_no_uniformes: [false, false, false], tazas_defectuosas: [false, false, false] };

    // Same two steps as the helper, with the autosave landing between them: the proxy's findMany
    // returns the row as the helper saw it and THEN the newer save (which carries `cups`) commits.
    const racing = {
      evaluation: {
        findMany: (async (args: Parameters<typeof prisma.evaluation.findMany>[0]) => {
          const rows = await prisma.evaluation.findMany(args);
          await prisma.evaluation.update({
            where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u1 } },
            data: { affectiveData: newer, cups: 3, individualScore: 99 },
          });
          return rows;
        }) as typeof prisma.evaluation.findMany,
        updateMany: prisma.evaluation.updateMany.bind(prisma.evaluation),
      },
    };
    const n = await recomputeLegacyDraftsInTx(racing as unknown as typeof prisma, {
      sessionId: s.id,
      cupperId: u1,
      now: new Date(),
      format: "affective",
      cupsPerSample: 3,
      referenceSampleId: null,
      referenceMode: "anchor",
    });

    expect(n).toBe(0);
    const row = await get(A.id, u1);
    expect(row.cups).toBe(3);
    expect(row.individualScore).toBe(99); // the newer save, not the recompute of the stale read
    expect(row.affectiveData).toEqual(newer);
  });

  it("the helper does not rewrite drafts of a session that has just expired (L9)", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({
      ownerId: owner,
      isGroup: true,
      participants: [u1],
      cupsPerSample: 3,
      closesAt: new Date(Date.now() - 60_000),
    });
    const A = s.samples[0];
    await legacyDraft({ sessionId: s.id, sampleId: A.id, cupperId: u1, cups: 3 });
    const args = { sessionId: s.id, cupperId: u1, now: new Date() };

    expect(await hasLegacyDrafts(prisma, args)).toBe(false);
    const n = await recomputeLegacyDraftsInTx(prisma, {
      ...args,
      format: "affective",
      cupsPerSample: 3,
      referenceSampleId: null,
      referenceMode: "anchor",
    });
    expect(n).toBe(0);
    expect((await get(A.id, u1)).cups).toBeNull();
  });
});
