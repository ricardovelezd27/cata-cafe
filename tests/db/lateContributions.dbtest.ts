// S10 WP4b (Kim C1 / C2) against real Postgres (real aggregate trigger, PHASE 26):
//  - acceptLateEvaluation: the owner accepts ONE complete draft of a closed group session
//  - submitLateDraft: a complete note left on a device reaches the server as a DRAFT only
//  - setPostCloseNote: a text note on the cupper's own submitted evaluation, nothing else
//  - announceClose / cancelAnnouncedClose: only the `closingAt` column moves
// Only external boundaries are mocked (auth user, next cache/server, Supabase admin, close email).
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
vi.mock("@/lib/closeEmail", () => ({ sendCloseEmails: async () => ({ attempted: 0, sent: 0, skipped: 0, failed: 0 }) }));

import {
  acceptLateEvaluation,
  announceClose,
  cancelAnnouncedClose,
  closeAnnounced,
  setPostCloseNote,
} from "@/app/actions/community";
import { submitLateDraft } from "@/app/actions/offline";
import { closeSessionInternal } from "@/lib/closeSession";
import { buildOwnerLateRows, totalAcceptanceWillStore } from "@/lib/lateContributions";
import { calcIndividualScore } from "@/lib/scoring";
import {
  affectiveData,
  makeCoffee,
  makeEvaluation,
  makeSession,
  makeUser,
  prisma,
  resetDb,
  storedAggregate,
} from "./support/db";

beforeEach(resetDb);

/** owner + u1 + u2; samples A (coffee) and B; u1 submitted A and B; u2 holds a COMPLETE draft of A. */
async function closedScenario(opts: { cups?: number; legacyDraft?: boolean } = {}) {
  const owner = await makeUser({ name: "Dueña" });
  const u1 = await makeUser({ name: "Uno" });
  const u2 = await makeUser({ name: "Dos" });
  const coffee = await makeCoffee(owner, "Huila Lote 7");
  const cups = opts.cups ?? 2;
  const s = await makeSession({
    ownerId: owner,
    isGroup: true,
    cupsPerSample: cups,
    participants: [u1, u2],
    samples: [{ label: "A", coffeeId: coffee.id }, { label: "B" }],
  });
  const [A, B] = s.samples;
  await makeEvaluation({ sampleId: A.id, sessionId: s.id, cupperId: u1, cupsPerSample: cups, values: 7 });
  await makeEvaluation({ sampleId: B.id, sessionId: s.id, cupperId: u1, cupsPerSample: cups, values: 6 });
  const draft = await makeEvaluation({
    sampleId: A.id,
    sessionId: s.id,
    cupperId: u2,
    cupsPerSample: cups,
    values: 5,
    nonUniform: cups >= 2 ? [true, false] : [],
    draft: true,
    overrides: opts.legacyDraft ? { cups: null } : {},
  });
  await closeSessionInternal(s.id, { reason: "owner", emails: "skip" });
  return { owner, u1, u2, coffee, s, A, B, draft, cups };
}

/** Accept with the `updatedAt` the organizer's page would have rendered right now. */
async function accept(evaluationId: string) {
  const row = await prisma.evaluation.findUnique({ where: { id: evaluationId }, select: { updatedAt: true } });
  return acceptLateEvaluation(evaluationId, (row?.updatedAt ?? new Date()).toISOString());
}

describe("acceptLateEvaluation: version guard, excluded cuppers", () => {
  it("a stale stamp answers conflict and flips nothing (the row changed after the page rendered)", async () => {
    const { owner, draft, A } = await closedScenario();
    const rendered = (await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).updatedAt.toISOString();
    // the content changes after the page rendered (79.00 shown, 100.00 now)
    await prisma.evaluation.update({
      where: { id: draft.id },
      data: { affectiveData: affectiveData(9), individualScore: 100 },
    });
    const aggBefore = await storedAggregate(A.id);
    h.userId = owner;
    expect(await acceptLateEvaluation(draft.id, rendered)).toEqual({ ok: false, error: "conflict" });
    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.isDraft).toBe(true);
    expect(row.acceptedLateAt).toBeNull();
    expect((await storedAggregate(A.id))?.communityScore).toBe(aggBefore?.communityScore);
    // with the CURRENT stamp it is accepted: the organizer now accepts what they re-read
    expect((await accept(draft.id)).ok).toBe(true);
  });

  it("the reviewer's probe: a late send never replaces the pre-close draft, so what is shown is what is accepted", async () => {
    const { owner, u2, draft, A } = await closedScenario();
    const shown = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    h.userId = u2;
    const sent = await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: affectiveData(9), clientTs: Date.now() });
    expect(sent).toEqual({ status: "conflict", reason: "saved_before_close" });
    const after = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.updatedAt.getTime()).toBe(shown.updatedAt.getTime());
    expect(after.individualScore).toBe(shown.individualScore);
    expect(after.receivedLateAt).toBeNull();
    h.userId = owner;
    expect((await acceptLateEvaluation(draft.id, shown.updatedAt.toISOString())).ok).toBe(true);
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).individualScore).toBe(shown.individualScore);
  });

  it("the reviewer's scenario: the server held 4 of 8 ratings at the close; the late send of 8 updates it, stamps it, lists it, and it can be accepted", async () => {
    const { owner, u2, A, s, draft } = await closedScenario();
    // auto-save left a PARTIAL draft at the close
    const partial: Record<string, unknown> = {};
    Object.entries(affectiveData(6)).slice(0, 4).forEach(([k, v]) => (partial[k] = v));
    await prisma.evaluation.update({ where: { id: draft.id }, data: { affectiveData: partial, individualScore: null } });
    h.userId = u2;
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: affectiveData(8), clientTs: Date.now() })).toEqual({ status: "synced" });
    const row = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.isDraft).toBe(true);
    expect(row.receivedLateAt).toBeInstanceOf(Date);
    expect((row.affectiveData as Record<string, unknown>).fragancia_af_final).toBe(8);
    // the organizer's late list shows it, labelled "received after the close"
    const rows = buildOwnerLateRows({
      ownerLens: true,
      isGroup: true,
      session: { status: "closed", format: "affective", closedAt: null },
      drafts: [{ ...row, individualScore: row.individualScore }],
      sampleLabels: new Map([[A.id, "A"]]),
      nameOf: () => "Dos",
    });
    expect(rows?.[0]).toMatchObject({ evaluationId: draft.id, receivedLate: true });
    h.userId = owner;
    expect((await accept(draft.id)).ok).toBe(true);
    expect(s.id).toBeTruthy();
  });

  it("a legacy (cups NULL) draft: the total the owner was shown equals the stored score after accept", async () => {
    const { owner, draft } = await closedScenario({ cups: 3, legacyDraft: true });
    const before = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    const shown = totalAcceptanceWillStore(
      { ...before, individualScore: before.individualScore } as never,
      "affective",
      { cupsPerSample: 3, referenceSampleId: null, referenceMode: "anchor" },
    );
    h.userId = owner;
    expect((await accept(draft.id)).ok).toBe(true);
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).individualScore).toBe(shown);
  });

  it("an excluded cupper's draft is refused and untouched", async () => {
    const { owner, u2, s, draft } = await closedScenario();
    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId: s.id, userId: u2 } },
      data: { excludedFromResults: true, excludedAt: new Date(), excludedBy: owner, exclusionReason: "protocol" },
    });
    h.userId = owner;
    expect(await accept(draft.id)).toEqual({ ok: false, error: "invalid_input" });
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).isDraft).toBe(true);
  });
});

describe("closeAnnounced", () => {
  async function announced(minutes: 2 | 5) {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 2 });
    h.userId = owner;
    await announceClose(s.id, minutes);
    const at = (await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } })).closingAt!;
    return { owner, s, at };
  }
  const statusOf = async (id: string) => (await prisma.cuppingSession.findUniqueOrThrow({ where: { id } })).status;

  it("announced for the future closes nothing", async () => {
    const { s, at } = await announced(5);
    expect(await closeAnnounced(s.id, at.toISOString())).toEqual({ ok: true, data: { closed: false, finalized: true } });
    expect(await statusOf(s.id)).toBe("active");
  });

  it("announced and due closes through the close routine", async () => {
    const { s } = await announced(2);
    const due = new Date(Date.now() - 500);
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closingAt: due } });
    const r = await closeAnnounced(s.id, due.toISOString());
    expect(r.ok && r.data.closed).toBe(true);
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("closed");
    expect(row.closedAt).toBeInstanceOf(Date);
  });

  it("announced then cancelled: the old instant closes nothing", async () => {
    const { s } = await announced(2);
    const due = new Date(Date.now() - 500);
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closingAt: due } });
    await cancelAnnouncedClose(s.id);
    expect(await closeAnnounced(s.id, due.toISOString())).toEqual({ ok: true, data: { closed: false, finalized: true } });
    expect(await statusOf(s.id)).toBe("active");
  });

  it("a re-announce (another instant) defeats the stale tab's old instant", async () => {
    const { s } = await announced(2);
    const old = new Date(Date.now() - 500);
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closingAt: old } });
    await announceClose(s.id, 5); // moves closingAt to now + 5 min
    expect((await closeAnnounced(s.id, old.toISOString())).ok).toBe(true);
    expect(await statusOf(s.id)).toBe("active");
  });

  it("the stored instant is due but DIFFERENT from the instant sent: closes nothing", async () => {
    const { s } = await announced(2);
    const stored = new Date(Date.now() - 500);
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { closingAt: stored } });
    const sent = new Date(stored.getTime() - 1000);
    expect(await closeAnnounced(s.id, sent.toISOString())).toEqual({ ok: true, data: { closed: false, finalized: true } });
    expect(await statusOf(s.id)).toBe("active");
  });

  it("only the owner can call it", async () => {
    const { s, at } = await announced(2);
    h.userId = await makeUser();
    expect(await closeAnnounced(s.id, at.toISOString())).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });
});

describe("acceptLateEvaluation", () => {
  it("submits ONE complete draft, stamps it, recomputes only that sample, writes history", async () => {
    const { owner, u1, u2, s, A, B, draft, coffee } = await closedScenario();
    const aggBBefore = await storedAggregate(B.id);
    const aggABefore = await storedAggregate(A.id);
    expect(aggABefore?.participantCount).toBe(1);
    const u1RowBefore = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u1 } },
    });

    h.userId = owner;
    const r = await accept(draft.id);
    expect(r).toEqual({ ok: true, data: { accepted: true } });

    const ev = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(ev.isDraft).toBe(false);
    expect(ev.submittedAt).toBeInstanceOf(Date);
    expect(ev.acceptedLateAt).toBeInstanceOf(Date);
    expect(ev.cups).toBe(2);

    const aggA = await storedAggregate(A.id);
    expect(aggA?.participantCount).toBe(2);
    expect(aggA?.ruleVersion).toBe(2);
    expect(aggA?.communityScore).not.toBe(aggABefore?.communityScore);

    // sample B's aggregate is untouched; so is the other cupper's row
    const aggBAfter = await storedAggregate(B.id);
    expect(aggBAfter?.communityScore).toBe(aggBBefore?.communityScore);
    expect(aggBAfter?.computedAt.getTime()).toBe(aggBBefore?.computedAt.getTime());
    const u1RowAfter = await prisma.evaluation.findUniqueOrThrow({ where: { id: u1RowBefore.id } });
    expect(u1RowAfter.individualScore).toBe(u1RowBefore.individualScore);
    expect(u1RowAfter.acceptedLateAt).toBeNull();

    // the cupper's history now has a row for the revealed coffee sample
    const hist = await prisma.userCoffeeHistory.findMany({ where: { sessionId: s.id, userId: u2, coffeeId: coffee.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0].communityScore).toBe(aggA?.communityScore);
  });

  it("is idempotent: a second call is a no-op success that changes nothing", async () => {
    const { owner, draft } = await closedScenario();
    h.userId = owner;
    await accept(draft.id);
    const first = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    const again = await accept(draft.id);
    expect(again).toEqual({ ok: true, data: { accepted: false } });
    const second = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(second.acceptedLateAt?.getTime()).toBe(first.acceptedLateAt?.getTime());
    expect(second.submittedAt?.getTime()).toBe(first.submittedAt?.getTime());
  });

  it("refuses an incomplete draft", async () => {
    const { owner, u2, A, draft } = await closedScenario();
    await prisma.evaluation.update({
      where: { id: draft.id },
      data: { affectiveData: { fragancia_af_final: 5 } },
    });
    expect(u2).toBeTruthy();
    expect(A).toBeTruthy();
    h.userId = owner;
    expect(await accept(draft.id)).toEqual({ ok: false, error: "invalid_input" });
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).isDraft).toBe(true);
  });

  it("refuses a draft of a session that is still open", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 2 });
    const d = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: u1, cupsPerSample: 2, draft: true });
    h.userId = owner;
    expect(await accept(d.id)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("refuses anyone who is not the session owner (cupper, outsider)", async () => {
    const { u1, u2, draft } = await closedScenario();
    const outsider = await makeUser();
    for (const who of [u2, u1, outsider]) {
      h.userId = who;
      expect(await accept(draft.id)).toEqual({ ok: false, error: "not_found_or_forbidden" });
    }
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).isDraft).toBe(true);
  });

  it("refuses a solo session and an unknown id", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: false, status: "closed" });
    const d = await makeEvaluation({ sampleId: s.samples[0].id, sessionId: s.id, cupperId: owner, draft: true });
    h.userId = owner;
    expect(await accept(d.id)).toEqual({ ok: false, error: "invalid_input" });
    expect(await acceptLateEvaluation("nope", new Date().toISOString())).toEqual({
      ok: false,
      error: "not_found_or_forbidden",
    });
  });

  it("rewrites a legacy draft (cups NULL) under the current rule before the flip", async () => {
    const { owner, A, draft, u2 } = await closedScenario({ cups: 3, legacyDraft: true });
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } })).cups).toBeNull();
    h.userId = owner;
    expect((await accept(draft.id)).ok).toBe(true);
    const ev = await prisma.evaluation.findUniqueOrThrow({ where: { id: draft.id } });
    expect(ev.cups).toBe(3);
    const data = ev.affectiveData as Record<string, unknown>;
    expect(ev.individualScore).toBe(calcIndividualScore({ ...data, tazas_no_uniformes: ev.nonUniformCups, tazas_defectuosas: ev.defectiveCups }, 3));
    expect((await storedAggregate(A.id))?.ruleVersion).toBe(2);
    expect(u2).toBeTruthy();
  });
});

describe("submitLateDraft", () => {
  const complete = (n = 6) => affectiveData(n);

  it("creates a DRAFT row only (never submitted, never accepted) for a closed group session", async () => {
    const { u1, A, s } = await closedScenario();
    // a cupper with no row yet
    const newbie = await makeUser({ name: "Tres" });
    await prisma.sessionParticipant.create({ data: { sessionId: s.id, userId: newbie, status: "joined" } });
    h.userId = newbie;
    const aggBefore = await storedAggregate(A.id);
    const r = await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete(), clientTs: Date.now() - 1000 });
    expect(r).toEqual({ status: "synced" });
    const ev = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: newbie } },
    });
    expect(ev.isDraft).toBe(true);
    expect(ev.submittedAt).toBeNull();
    expect(ev.acceptedLateAt).toBeNull();
    expect(ev.receivedLateAt).toBeInstanceOf(Date); // the server's own record of "after the close"
    expect(ev.cups).toBe(2);
    // no trigger, no score moved
    const aggAfter = await storedAggregate(A.id);
    expect(aggAfter?.communityScore).toBe(aggBefore?.communityScore);
    expect(aggAfter?.computedAt.getTime()).toBe(aggBefore?.computedAt.getTime());
    expect(u1).toBeTruthy();
  });

  it("updates an existing draft only when the device copy is newer", async () => {
    const { A, s } = await closedScenario();
    // a cupper who had NO row at the close (a pre-close draft is never replaced)
    const late = await makeUser({ name: "Cuatro" });
    await prisma.sessionParticipant.create({ data: { sessionId: s.id, userId: late, status: "joined" } });
    h.userId = late;
    const t1 = Date.now() - 60_000;
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete(8), clientTs: t1 })).toEqual({ status: "synced" });
    const afterNewer = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: late } },
    });
    expect(afterNewer.receivedLateAt).toBeInstanceOf(Date);
    // a NEWER device copy updates it and keeps the server stamp
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete(7), clientTs: t1 + 10_000 })).toEqual({ status: "synced" });
    expect(((await prisma.evaluation.findUniqueOrThrow({ where: { id: afterNewer.id } })).affectiveData as Record<string, unknown>).fragancia_af_final).toBe(7);
    await prisma.evaluation.update({ where: { id: afterNewer.id }, data: { affectiveData: complete(8) } });
    expect((afterNewer.affectiveData as Record<string, unknown>).fragancia_af_final).toBe(8);
    // an OLDER device copy does not overwrite it, and still answers synced
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete(3), clientTs: t1 - 30_000 })).toEqual({ status: "synced" });
    const afterOlder = await prisma.evaluation.findUniqueOrThrow({ where: { id: afterNewer.id } });
    expect((afterOlder.affectiveData as Record<string, unknown>).fragancia_af_final).toBe(8);
    expect(afterOlder.isDraft).toBe(true);
  });

  it("never writes over a SUBMITTED row (conflict, nothing changes)", async () => {
    const { u1, A } = await closedScenario();
    h.userId = u1;
    const before = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u1 } },
    });
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete(2), clientTs: Date.now() })).toEqual({ status: "conflict", reason: "submitted" });
    const after = await prisma.evaluation.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.affectiveData).toEqual(before.affectiveData);
    expect(after.isDraft).toBe(false);
    expect(after.individualScore).toBe(before.individualScore);
  });

  it("composition with the re-pin rules: a pinned reference gets the anchor and a stash of the real ratings, labelled received-late", async () => {
    const { A, s } = await closedScenario();
    await prisma.sessionSample.update({ where: { id: A.id }, data: { referenceRank: 1 } });
    await prisma.cuppingSession.update({ where: { id: s.id }, data: { referenceSampleId: A.id, referenceMode: "anchor" } });
    const late = await makeUser({ name: "Cinco" });
    await prisma.sessionParticipant.create({ data: { sessionId: s.id, userId: late, status: "joined" } });
    h.userId = late;
    // real ratings and a CLIENT-sent forged stash: neither may survive as sent
    const posted = { ...complete(8), ref_previo: { valores: { fragancia_af_final: 1 }, en: "2020-01-01T00:00:00.000Z" } };
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: posted, clientTs: Date.now() })).toEqual({ status: "synced" });
    const row = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: late } },
    });
    const stored = row.affectiveData as Record<string, unknown>;
    expect(row.isDraft).toBe(true);
    expect(row.receivedLateAt).toBeInstanceOf(Date);
    expect(stored.fragancia_af_final).toBe(5); // pinned at the anchor
    const stash = stored.ref_previo as { valores: Record<string, unknown> };
    expect(stash.valores.fragancia_af_final).toBe(8); // the cupper's real ratings, not the forged ones
  });

  it("answers pending (writes nothing) for an open session, rejected for incomplete data or a solo session", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const open = await makeSession({ ownerId: owner, isGroup: true, participants: [u1], cupsPerSample: 2 });
    h.userId = u1;
    expect(await submitLateDraft({ sessionSampleId: open.samples[0].id, moduleKey: "affective", data: complete() })).toEqual({ status: "pending" });
    expect(await prisma.evaluation.count({ where: { cupperId: u1 } })).toBe(0);

    const { u2, A } = await closedScenario();
    h.userId = u2;
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: { fragancia_af_final: 5 } })).toEqual({ status: "rejected" });

    const solo = await makeSession({ ownerId: owner, isGroup: false, status: "closed" });
    h.userId = owner;
    expect(await submitLateDraft({ sessionSampleId: solo.samples[0].id, moduleKey: "affective", data: complete() })).toEqual({ status: "rejected" });
  });

  it("answers gone for a sample the user is not a member of", async () => {
    const { A } = await closedScenario();
    h.userId = await makeUser();
    expect(await submitLateDraft({ sessionSampleId: A.id, moduleKey: "affective", data: complete() })).toEqual({ status: "gone" });
  });
});

describe("setPostCloseNote", () => {
  it("writes ONLY its two columns: no trigger, no score, no JSON module, still submitted", async () => {
    const { u1, A } = await closedScenario();
    const row = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u1 } },
    });
    const aggBefore = await storedAggregate(A.id);

    h.userId = u1;
    const r = await setPostCloseNote(row.id, "  Me di cuenta tarde: más dulzor  ");
    expect(r.ok).toBe(true);

    const after = await prisma.evaluation.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.postCloseNote).toBe("Me di cuenta tarde: más dulzor");
    expect(after.postCloseNoteAt).toBeInstanceOf(Date);
    const { postCloseNote, postCloseNoteAt, updatedAt, ...rest } = after;
    const { postCloseNote: _n, postCloseNoteAt: _a, updatedAt: _u, ...restBefore } = row;
    void postCloseNote; void postCloseNoteAt; void updatedAt; void _n; void _a; void _u;
    expect(rest).toEqual(restBefore);

    const aggAfter = await storedAggregate(A.id);
    expect(aggAfter?.communityScore).toBe(aggBefore?.communityScore);
    expect(aggAfter?.computedAt.getTime()).toBe(aggBefore?.computedAt.getTime());

    // "" clears
    const cleared = await setPostCloseNote(row.id, "");
    expect(cleared).toEqual({ ok: true, data: { text: null, at: null } });
    const after2 = await prisma.evaluation.findUniqueOrThrow({ where: { id: row.id } });
    expect(after2.postCloseNote).toBeNull();
    expect(after2.postCloseNoteAt).toBeNull();
  });

  it("refuses someone else's evaluation, a draft, an open session and a note over 500 characters", async () => {
    const { u1, u2, owner, A, draft } = await closedScenario();
    const row = await prisma.evaluation.findUniqueOrThrow({
      where: { sessionSampleId_cupperId: { sessionSampleId: A.id, cupperId: u1 } },
    });
    // another cupper (and the owner) cannot write on u1's evaluation
    for (const who of [u2, owner]) {
      h.userId = who;
      expect(await setPostCloseNote(row.id, "intruso")).toEqual({ ok: false, error: "not_found_or_forbidden" });
    }
    // u2's own row is still a draft
    h.userId = u2;
    expect(await setPostCloseNote(draft.id, "nota")).toEqual({ ok: false, error: "invalid_input" });
    // too long
    h.userId = u1;
    expect(await setPostCloseNote(row.id, "x".repeat(501))).toEqual({ ok: false, error: "invalid_input" });
    expect((await prisma.evaluation.findUniqueOrThrow({ where: { id: row.id } })).postCloseNote).toBeNull();

    // an open session
    const o = await makeUser();
    const open = await makeSession({ ownerId: o, isGroup: true });
    const e = await makeEvaluation({ sampleId: open.samples[0].id, sessionId: open.id, cupperId: o });
    h.userId = o;
    expect(await setPostCloseNote(e.id, "pronto")).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("announceClose / cancelAnnouncedClose", () => {
  it("moves only closingAt; a non-owner and a solo session are refused; 3 minutes is invalid", async () => {
    const owner = await makeUser();
    const u1 = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true, participants: [u1] });
    h.userId = owner;
    const before = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    const r = await announceClose(s.id, 2);
    expect(r.ok).toBe(true);
    const row = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.closingAt).toBeInstanceOf(Date);
    const lead = row.closingAt!.getTime() - Date.now();
    expect(lead).toBeGreaterThan(110_000);
    expect(lead).toBeLessThanOrEqual(120_000);
    expect(row.status).toBe("active");
    expect(row.closedAt).toBeNull();
    expect({ ...row, closingAt: null, updatedAt: null }).toEqual({ ...before, closingAt: null, updatedAt: null });

    expect(await announceClose(s.id, 3)).toEqual({ ok: false, error: "invalid_input" });
    h.userId = u1;
    expect(await announceClose(s.id, 5)).toEqual({ ok: false, error: "not_found_or_forbidden" });
    expect(await cancelAnnouncedClose(s.id)).toEqual({ ok: false, error: "not_found_or_forbidden" });

    h.userId = owner;
    expect(await cancelAnnouncedClose(s.id)).toEqual({ ok: true, data: { cancelled: true } });
    expect((await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } })).closingAt).toBeNull();
    // idempotent
    expect(await cancelAnnouncedClose(s.id)).toEqual({ ok: true, data: { cancelled: false } });

    const solo = await makeSession({ ownerId: owner, isGroup: false });
    expect(await announceClose(solo.id, 2)).toEqual({ ok: false, error: "invalid_input" });
  });

  it("is refused once the session is closed, and the close routine leaves closingAt alone", async () => {
    const owner = await makeUser();
    const s = await makeSession({ ownerId: owner, isGroup: true });
    h.userId = owner;
    expect((await announceClose(s.id, 5)).ok).toBe(true);
    const announced = (await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } })).closingAt;
    await closeSessionInternal(s.id, { reason: "owner", emails: "skip" });
    const closed = await prisma.cuppingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(closed.status).toBe("closed");
    expect(closed.closingAt?.getTime()).toBe(announced?.getTime());
    expect(await announceClose(s.id, 2)).toEqual({ ok: false, error: "session_closed" });
  });
});
