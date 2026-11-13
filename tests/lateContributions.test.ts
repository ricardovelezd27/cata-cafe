import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import {
  POST_CLOSE_NOTE_MAX,
  buildMyLateNotices,
  buildOwnerLateRows,
  buildPostCloseNotes,
  isAcceptableLate,
  isModuleSendable,
  normalizePostCloseNote,
  planLateDraftWrite,
  postCloseNoteAllowed,
  type LateDraftForOwner,
  type LateDraftInput,
  type PostCloseNoteEval,
} from "@/lib/lateContributions";

function complete(): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const a of AFFECTIVE_ATTRIBUTES) d[`${a.id}_final`] = 6;
  return d;
}
const closed = { status: "closed", format: "affective" };
const ev = (over: Partial<LateDraftInput> = {}): LateDraftInput => ({
  id: "e1",
  cupperId: "u1",
  sessionSampleId: "s1",
  isDraft: true,
  descriptiveData: {},
  affectiveData: complete(),
  combinedData: {},
  updatedAt: new Date("2026-11-15T10:30:00Z"),
  ...over,
});

describe("isAcceptableLate", () => {
  it("a complete draft in a closed session is acceptable", () => {
    expect(isAcceptableLate(ev(), closed)).toBe(true);
  });
  it("refuses an incomplete draft", () => {
    expect(isAcceptableLate(ev({ affectiveData: { [`${AFFECTIVE_ATTRIBUTES[0].id}_final`]: 5 } }), closed)).toBe(false);
  });
  it("refuses a draft in an open or merely expired session (status decides)", () => {
    expect(isAcceptableLate(ev(), { status: "active", format: "affective" })).toBe(false);
  });
  it("refuses an already submitted row", () => {
    expect(isAcceptableLate(ev({ isDraft: false }), closed)).toBe(false);
  });
  it("refuses a deleted-account placeholder", () => {
    expect(isAcceptableLate(ev({ cupperId: "deleted_ab12" }), closed)).toBe(false);
  });
  it("uses the format's own column (combined reads combinedData)", () => {
    const combined = ev({ affectiveData: {}, combinedData: complete() });
    expect(isAcceptableLate(combined, { status: "closed", format: "combined" })).toBe(true);
    expect(isAcceptableLate(combined, { status: "closed", format: "affective" })).toBe(false);
  });
});

describe("isAcceptableLate: excluded cuppers", () => {
  it("an excluded cupper's draft is refused, an included one passes", () => {
    expect(isAcceptableLate(ev(), closed, { excluded: true })).toBe(false);
    expect(isAcceptableLate(ev(), closed, { excluded: false })).toBe(true);
  });
  it("a guest (anonymous) cupper id passes: only deleted placeholders are refused", () => {
    expect(isAcceptableLate(ev({ cupperId: "3f2a-anon-guest" }), closed)).toBe(true);
  });
});

describe("buildOwnerLateRows (privacy gate)", () => {
  const labels = new Map([["s1", "Muestra A"], ["s2", "Muestra B"]]);
  const base = {
    isGroup: true,
    session: { status: "closed", format: "affective", closedAt: new Date("2026-11-15T10:00:00Z") },
    sampleLabels: labels,
    nameOf: (id: string) => (id === "u1" ? "Ana" : "Beto"),
  };
  const owner = (d: LateDraftInput, over: Partial<LateDraftForOwner> = {}): LateDraftForOwner => ({
    ...d,
    individualScore: 79,
    receivedLateAt: null,
    ...over,
  });
  const drafts = [
    owner(ev()),
    owner(ev({ id: "e2", cupperId: "u2", sessionSampleId: "s2" }), { receivedLateAt: new Date("2026-11-15T10:30:00Z") }),
    owner(ev({ id: "e3", isDraft: false })),
  ];
  it("owner lens gets one row per acceptable draft; the label comes from the server stamp only", () => {
    const rows = buildOwnerLateRows({ ...base, ownerLens: true, drafts });
    expect(rows?.map((r) => [r.evaluationId, r.cupperName, r.sampleLabel, r.receivedLate])).toEqual([
      ["e1", "Ana", "Muestra A", false],
      ["e2", "Beto", "Muestra B", true],
    ]);
  });
  it("carries the score, the difference from the group, the 8 ratings, the version stamp and the old-rule flag", () => {
    const rows = buildOwnerLateRows({
      ...base,
      ownerLens: true,
      drafts: [owner(ev(), { individualScore: 82.5 }), owner(ev({ id: "e2", cupperId: "u2", sessionSampleId: "s2" }), { individualScore: null })],
      groupScoreBySample: new Map([["s1", 80], ["s2", null]]),
      oldRuleSampleIds: new Set(["s2"]),
    });
    expect(rows).toHaveLength(2);
    expect(rows![0]).toMatchObject({ individualScore: 82.5, groupScore: 80, diff: 2.5, oldRule: false });
    expect(rows![0].updatedAt).toBe("2026-11-15T10:30:00.000Z");
    expect(rows![0].ratings).toHaveLength(8);
    expect(rows![0].ratings.every((r) => r.value === 6)).toBe(true);
    expect(rows![1]).toMatchObject({ individualScore: null, groupScore: null, diff: null, oldRule: true });
  });
  it("an excluded cupper is not listed", () => {
    const rows = buildOwnerLateRows({ ...base, ownerLens: true, drafts, excludedUserIds: new Set(["u1"]) });
    expect(rows?.map((r) => r.evaluationId)).toEqual(["e2"]);
    expect(buildOwnerLateRows({ ...base, ownerLens: true, drafts, excludedUserIds: new Set(["u1", "u2"]) })).toBeNull();
  });
  it("a participant (not the owner lens) never gets a row, a name or a count", () => {
    expect(buildOwnerLateRows({ ...base, ownerLens: false, drafts })).toBeNull();
  });
  it("null for a solo session, an open session, or nothing acceptable", () => {
    expect(buildOwnerLateRows({ ...base, ownerLens: true, isGroup: false, drafts })).toBeNull();
    expect(buildOwnerLateRows({ ...base, ownerLens: true, session: { ...base.session, status: "active" }, drafts })).toBeNull();
    expect(buildOwnerLateRows({ ...base, ownerLens: true, drafts: [owner(ev({ isDraft: false }))] })).toBeNull();
  });
});

describe("buildMyLateNotices", () => {
  const labels = new Map([["s1", "Muestra A"], ["s2", "Muestra B"]]);
  const accepted = new Date("2026-11-15T12:00:00Z");
  it("left_out for a complete draft, included once accepted, nothing for an incomplete one", () => {
    const out = buildMyLateNotices({
      isGroup: true,
      session: closed,
      sampleLabels: labels,
      mine: [
        { ...ev(), acceptedLateAt: null },
        { ...ev({ id: "e2", sessionSampleId: "s2", isDraft: false }), acceptedLateAt: accepted },
        { ...ev({ id: "e3", sessionSampleId: "s3", affectiveData: {} }), acceptedLateAt: null },
      ],
    });
    expect(out).toEqual([
      { kind: "left_out", sampleId: "s1", sampleLabel: "Muestra A" },
      { kind: "included", sampleId: "s2", sampleLabel: "Muestra B", at: accepted.toISOString() },
    ]);
  });
  it("an excluded viewer gets no line at all", () => {
    expect(
      buildMyLateNotices({
        isGroup: true,
        session: closed,
        sampleLabels: labels,
        viewerExcluded: true,
        mine: [{ ...ev({ isDraft: false }), acceptedLateAt: accepted }, { ...ev({ id: "e9", sessionSampleId: "s2" }), acceptedLateAt: null }],
      }),
    ).toEqual([]);
  });
  it("nothing in a solo or open session", () => {
    expect(buildMyLateNotices({ isGroup: false, session: closed, sampleLabels: labels, mine: [{ ...ev(), acceptedLateAt: null }] })).toEqual([]);
    expect(buildMyLateNotices({ isGroup: true, session: { status: "active", format: "affective" }, sampleLabels: labels, mine: [{ ...ev(), acceptedLateAt: null }] })).toEqual([]);
  });
});

describe("planLateDraftWrite", () => {
  const t0 = 1_700_000_000_000;
  const late = new Date(t0 + 5);
  it("no row creates; a submitted row is a conflict and writes nothing", () => {
    expect(planLateDraftWrite({ existing: null, clientTs: t0 })).toBe("create");
    expect(planLateDraftWrite({ existing: { isDraft: false, lastClientWriteAt: null, receivedLateAt: null }, clientTs: t0 })).toBe("conflict");
    expect(planLateDraftWrite({ existing: { isDraft: false, lastClientWriteAt: null, receivedLateAt: late }, clientTs: t0 })).toBe("conflict");
  });
  it("a draft the server already had at the close is NEVER replaced (even by a newer device copy)", () => {
    const now = t0 + 10_000;
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: null, receivedLateAt: null }, clientTs: t0 + 9_000, now })).toBe("conflict");
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: new Date(t0), receivedLateAt: null }, clientTs: t0 + 1, now })).toBe("conflict");
  });
  it("a draft that itself arrived late updates only when the device copy is not older", () => {
    const now = t0 + 10_000;
    const row = (ts: number | null) => ({ isDraft: true, lastClientWriteAt: ts === null ? null : new Date(ts), receivedLateAt: late });
    expect(planLateDraftWrite({ existing: row(t0), clientTs: t0 + 1, now })).toBe("update");
    expect(planLateDraftWrite({ existing: row(t0), clientTs: t0, now })).toBe("update");
    expect(planLateDraftWrite({ existing: row(t0), clientTs: t0 - 1, now })).toBe("stale");
    expect(planLateDraftWrite({ existing: row(null), clientTs: t0, now })).toBe("update");
  });
});

describe("isModuleSendable", () => {
  it("only complete evaluation modules are offered", () => {
    expect(isModuleSendable("affective", complete())).toBe(true);
    expect(isModuleSendable("affective", {})).toBe(false);
    expect(isModuleSendable("physical", complete())).toBe(false);
    expect(isModuleSendable("extrinsic", complete())).toBe(false);
  });
});

describe("post-close note", () => {
  it("normalizes: trims, empty clears, max 500, text only", () => {
    expect(normalizePostCloseNote("  hola  ")).toBe("hola");
    expect(normalizePostCloseNote("")).toBeNull();
    expect(normalizePostCloseNote("   ")).toBeNull();
    expect(normalizePostCloseNote("x".repeat(POST_CLOSE_NOTE_MAX))).toHaveLength(POST_CLOSE_NOTE_MAX);
    expect(() => normalizePostCloseNote("x".repeat(POST_CLOSE_NOTE_MAX + 1))).toThrow("invalid_input");
    expect(() => normalizePostCloseNote(7)).toThrow("invalid_input");
  });
  it("only the owner of a SUBMITTED row in a CLOSED session may write", () => {
    const e = { cupperId: "u1", isDraft: false };
    expect(postCloseNoteAllowed({ sessionStatus: "closed", evaluation: e, userId: "u1" })).toBe(true);
    expect(postCloseNoteAllowed({ sessionStatus: "closed", evaluation: e, userId: "u2" })).toBe(false);
    expect(postCloseNoteAllowed({ sessionStatus: "closed", evaluation: { ...e, isDraft: true }, userId: "u1" })).toBe(false);
    expect(postCloseNoteAllowed({ sessionStatus: "active", evaluation: e, userId: "u1" })).toBe(false);
  });
});

describe("buildPostCloseNotes (privacy gate)", () => {
  const at = new Date("2026-11-15T12:00:00Z");
  const evals: PostCloseNoteEval[] = [
    { id: "e1", cupperId: "me", sessionSampleId: "s1", isDraft: false, postCloseNote: "mi nota", postCloseNoteAt: at },
    { id: "e2", cupperId: "other", sessionSampleId: "s1", isDraft: false, postCloseNote: "secreto", postCloseNoteAt: at },
    { id: "e3", cupperId: "me", sessionSampleId: "s2", isDraft: false, postCloseNote: null, postCloseNoteAt: null },
    { id: "e4", cupperId: "other", sessionSampleId: "s2", isDraft: true, postCloseNote: "borrador", postCloseNoteAt: at },
  ];
  it("a participant's payload carries only their own rows and never another cupper's note", () => {
    const p = buildPostCloseNotes({ sessionStatus: "closed", ownerLens: false, viewerId: "me", evals });
    expect(p.byCupper).toBeNull();
    expect(Object.keys(p.mine).sort()).toEqual(["s1", "s2"]);
    expect(JSON.stringify(p)).not.toContain("secreto");
    expect(JSON.stringify(p)).not.toContain("other");
    expect(p.mine.s1).toEqual({ evaluationId: "e1", text: "mi nota", at: at.toISOString() });
    expect(p.mine.s2).toEqual({ evaluationId: "e3", text: null, at: null });
  });
  it("the owner lens also gets the other cuppers' notes (submitted rows with text only)", () => {
    const p = buildPostCloseNotes({ sessionStatus: "closed", ownerLens: true, viewerId: "me", evals });
    expect(p.byCupper).toEqual({ other: { s1: { text: "secreto", at: at.toISOString() } } });
  });
  it("nothing before the session is closed", () => {
    expect(buildPostCloseNotes({ sessionStatus: "active", ownerLens: true, viewerId: "me", evals })).toEqual({ mine: {}, byCupper: null });
  });
});
