// S10 WP1b review H1: a legacy evaluation's untyped defective cups survive a save
// that comes from the form after the cupper touched ANOTHER part of the grid.
// Stored defectiveCups, individualScore and the trigger's aggregate must not move
// (decision doc 5.3: "no se pierde ningun defecto ya registrado").
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: h.userId, is_anonymous: false }),
  requireRegisteredUser: async () => ({ id: h.userId, is_anonymous: false }),
  requireUserExpecting: async () => ({ id: h.userId, is_anonymous: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));

import { upsertEvaluation } from "@/app/actions/sessions";
import { applyDefectChoice, applyNonUniformToggle } from "@/lib/cupDefects";
import { affectiveData, makeEvaluation, makeSession, makeUser, prisma, resetDb, storedAggregate } from "./support/db";

beforeEach(resetDb);

async function legacySetup() {
  const owner = await makeUser({ name: "Duena" });
  const s = await makeSession({ ownerId: owner, cupsPerSample: 3, samples: [{}] });
  const sample = s.samples[0];
  // Legacy blob: no `tazas_defecto_tipo` key, two flagged cups, no type at all.
  const legacy = {
    ...affectiveData(7),
    tazas_no_uniformes: [true, true, false],
    tazas_defectuosas: [true, true, false],
  };
  await makeEvaluation({ sampleId: sample.id, sessionId: s.id, cupperId: owner, cupsPerSample: 3,
    values: 7, nonUniform: legacy.tazas_no_uniformes, defective: legacy.tazas_defectuosas });
  h.userId = owner;
  const row = () =>
    prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: sample.id, cupperId: owner } },
    });
  const save = (data: Record<string, unknown>) =>
    upsertEvaluation({
      sessionSampleId: sample.id,
      sessionId: s.id,
      moduleKey: "affective",
      data,
      cupsPerSample: 3,
    });
  return { legacy, sample, row, save };
}

describe("upsertEvaluation keeps a legacy untyped defective cup", () => {
  it("typing only one of two legacy defective cups leaves both deductions, the score and the aggregate unchanged", async () => {
    const { legacy, sample, row, save } = await legacySetup();
    const before = await row();
    const aggBefore = await storedAggregate(sample.id);
    expect(before.defectiveCups).toEqual([true, true, false]);

    expect((await save(applyDefectChoice(legacy, 3, 0, "phenolic"))).ok).toBe(true);

    const after = await row();
    expect(after.defectiveCups).toEqual([true, true, false]);
    expect(after.individualScore).toBe(before.individualScore);
    expect((await storedAggregate(sample.id))?.communityScore).toBe(aggBefore?.communityScore);
  });

  it("tapping non-uniform on another cup never removes a defective cup", async () => {
    const { legacy, row, save } = await legacySetup();
    const before = await row();
    expect((await save(applyNonUniformToggle(legacy, 3, 2))).ok).toBe(true);
    const after = await row();
    expect(after.defectiveCups).toEqual([true, true, false]);
    // one more non-uniform cup costs exactly 2; nothing else moves
    expect(Number(after.individualScore)).toBe(Number(before.individualScore) - 2);
  });

  it("the cupper can still unmark one deliberately", async () => {
    const { legacy, row, save } = await legacySetup();
    await save(applyDefectChoice(legacy, 3, 1, null));
    expect((await row()).defectiveCups).toEqual([true, false, false]);
  });
});
