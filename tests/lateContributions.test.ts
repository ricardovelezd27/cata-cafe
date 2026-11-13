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
  receivedAfterClose,
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

describe("receivedAfterClose", () => {
  const closedAt = new Date("2026-11-15T10:00:00Z");
  it("flags only a save strictly after the close", () => {
    expect(receivedAfterClose(new Date("2026-11-15T10:00:01Z"), closedAt)).toBe(true);
    expect(receivedAfterClose(new Date("2026-11-15T10:00:00Z"), closedAt)).toBe(false);
    expect(receivedAfterClose(new Date("2026-11-15T09:59:00Z"), closedAt)).toBe(false);
    expect(receivedAfterClose(new Date("2026-11-15T11:00:00Z"), null)).toBe(false);
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
  const drafts = [ev(), ev({ id: "e2", cupperId: "u2", sessionSampleId: "s2" }), ev({ id: "e3", isDraft: false })];
  it("owner lens gets one row per acceptable draft, flagged when received after close", () => {
    const rows = buildOwnerLateRows({ ...base, ownerLens: true, drafts });
    expect(rows?.map((r) => [r.evaluationId, r.cupperName, r.sampleLabel, r.receivedAfterClose])).toEqual([
      ["e1", "Ana", "Muestra A", true],
      ["e2", "Beto", "Muestra B", true],
    ]);
  });
  it("a participant (not the owner lens) never gets a row, a name or a count", () => {
    expect(buildOwnerLateRows({ ...base, ownerLens: false, drafts })).toBeNull();
  });
  it("null for a solo session, an open session, or nothing acceptable", () => {
    expect(buildOwnerLateRows({ ...base, ownerLens: true, isGroup: false, drafts })).toBeNull();
    expect(buildOwnerLateRows({ ...base, ownerLens: true, session: { ...base.session, status: "active" }, drafts })).toBeNull();
    expect(buildOwnerLateRows({ ...base, ownerLens: true, drafts: [ev({ isDraft: false })] })).toBeNull();
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
  it("nothing in a solo or open session", () => {
    expect(buildMyLateNotices({ isGroup: false, session: closed, sampleLabels: labels, mine: [{ ...ev(), acceptedLateAt: null }] })).toEqual([]);
    expect(buildMyLateNotices({ isGroup: true, session: { status: "active", format: "affective" }, sampleLabels: labels, mine: [{ ...ev(), acceptedLateAt: null }] })).toEqual([]);
  });
});

describe("planLateDraftWrite", () => {
  const t0 = 1_700_000_000_000;
  it("no row creates; a submitted row is a conflict and writes nothing", () => {
    expect(planLateDraftWrite({ existing: null, clientTs: t0 })).toBe("create");
    expect(planLateDraftWrite({ existing: { isDraft: false, lastClientWriteAt: null }, clientTs: t0 })).toBe("conflict");
  });
  it("an existing draft updates only when the device copy is not older", () => {
    const now = t0 + 10_000;
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: new Date(t0) }, clientTs: t0 + 1, now })).toBe("update");
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: new Date(t0) }, clientTs: t0, now })).toBe("update");
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: new Date(t0) }, clientTs: t0 - 1, now })).toBe("stale");
    expect(planLateDraftWrite({ existing: { isDraft: true, lastClientWriteAt: null }, clientTs: t0, now })).toBe("update");
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
