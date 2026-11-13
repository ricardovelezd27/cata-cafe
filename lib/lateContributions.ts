// S10 WP4b (Kim C1 + C2, `TODO(kim-validar:C1)` / `TODO(kim-validar:C2)`): pure
// rules for what happens AFTER a group session closed. No Prisma, no Next, no
// React, so the server actions, the results page payload builders and the tests
// share one definition.
//
// Owner decisions that bind this module (2026-11-12): a late evaluation is
// accepted by the session OWNER only, only if it is a COMPLETE draft, stamped
// (`Evaluation.acceptedLateAt`); the cupper's own stored score for it is written
// once, at acceptance; a text note after close is text only, never a rating.
// Review fixes (PR #131): the organizer sees what they accept (score, difference
// from the group, the ratings, and whether the server received it before or after
// the close), accepts exactly the version they saw (`updatedAt` guard in the
// action), a draft the server already had at the close is never replaced after it,
// and an excluded cupper is never accepted.

import { isEvaluationComplete, type EvaluationRowLike } from "@/lib/closeRules";
import { isDeletedProfileId } from "@/lib/accountDeletion/deletedProfile";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { shouldApplyClientWrite } from "@/lib/offline/clientWrite";
import * as v from "@/lib/validate";

/** Max characters of the note a cupper can add after the close (C2). */
export const POST_CLOSE_NOTE_MAX = 500;

// ─── C1b: which drafts the owner may accept ─────────────────────────────────

/** Whether a draft left at close can be accepted by the owner. The session must
 *  be `closed` (status, not merely past `closesAt`: an expired-not-closed
 *  session is still closed by the owner first), the evaluation a DRAFT, COMPLETE
 *  by the same rule the submit path and `countUnsentComplete` use
 *  (`isEvaluationComplete` in lib/closeRules.ts, which delegates to
 *  lib/evaluationState.ts). A guest (anonymous) cupper passes; only a
 *  deleted-account placeholder and a cupper the owner EXCLUDED from the results
 *  (`ctx.excluded`, the participant's `excludedFromResults`) are refused. */
export function isAcceptableLate(
  evaluation: EvaluationRowLike,
  session: { status: string; format: string },
  ctx: { excluded?: boolean } = {},
): boolean {
  if (session.status !== "closed") return false;
  if (!evaluation.isDraft) return false;
  if (ctx.excluded === true) return false;
  if (isDeletedProfileId(evaluation.cupperId)) return false;
  return isEvaluationComplete(evaluation, session.format);
}

export type LateDraftInput = EvaluationRowLike & {
  id: string;
  sessionSampleId: string;
  updatedAt: Date;
};

export type LateDraftForOwner = LateDraftInput & {
  /** The evaluation's own stored total (null = partial / not scored). */
  individualScore: number | null;
  /** Server stamp: set only when a device's late send put this content on the server after the close. */
  receivedLateAt: Date | null;
};

export type OwnerLateRow = {
  evaluationId: string;
  cupperName: string;
  sampleId: string;
  sampleLabel: string;
  /** ISO of the draft's last save. */
  savedAt: string;
  /** The version guard: the row's `updatedAt` as rendered (ISO, milliseconds kept). */
  updatedAt: string;
  /** true = the server received this content AFTER the close (`receivedLateAt`); false = it already had it at the close. */
  receivedLate: boolean;
  individualScore: number | null;
  /** That sample's current group score and the evaluation's difference from it (null when either is). */
  groupScore: number | null;
  diff: number | null;
  /** The 8 affective ratings, in attribute order (null = not rated). */
  ratings: { id: string; value: number | null }[];
  /** The sample's stored group score is under the pre-2026-11 rule: accepting moves it to the current one. */
  oldRule: boolean;
};

function ratingsOf(d: EvaluationRowLike, format: string): { id: string; value: number | null }[] {
  const raw = format === "combined" ? d.combinedData : d.affectiveData;
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return AFFECTIVE_ATTRIBUTES.map((a) => {
    const n = Number(obj[`${a.id}_final`] ?? obj[a.id] ?? NaN);
    return { id: a.id, value: Number.isFinite(n) && n > 0 ? n : null };
  });
}

/** The owner's "Evaluaciones recibidas tarde" rows. Everything another cupper
 *  could be told (a name, a count, a score) lives ONLY here, so the payload
 *  builder is the privacy gate: a viewer who is not the owner lens gets null, as
 *  does a session that is not a closed group session or has nothing acceptable.
 *  Excluded cuppers are not listed. */
export function buildOwnerLateRows(input: {
  ownerLens: boolean;
  isGroup: boolean;
  session: { status: string; format: string; closedAt: Date | null };
  drafts: LateDraftForOwner[];
  sampleLabels: Map<string, string>;
  nameOf: (cupperId: string) => string;
  excludedUserIds?: ReadonlySet<string>;
  /** Current group score per sample (the owner's TS recompute). */
  groupScoreBySample?: ReadonlyMap<string, number | null>;
  /** Samples whose stored aggregate is under the pre-2026-11 rule. */
  oldRuleSampleIds?: ReadonlySet<string>;
}): OwnerLateRow[] | null {
  if (!input.ownerLens || !input.isGroup || input.session.status !== "closed") return null;
  const rows: OwnerLateRow[] = [];
  for (const d of input.drafts) {
    const excluded = input.excludedUserIds?.has(d.cupperId) === true;
    if (!isAcceptableLate(d, input.session, { excluded })) continue;
    const group = input.groupScoreBySample?.get(d.sessionSampleId) ?? null;
    rows.push({
      evaluationId: d.id,
      cupperName: input.nameOf(d.cupperId),
      sampleId: d.sessionSampleId,
      sampleLabel: input.sampleLabels.get(d.sessionSampleId) ?? "",
      savedAt: d.updatedAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      receivedLate: d.receivedLateAt !== null,
      individualScore: d.individualScore,
      groupScore: group,
      diff:
        d.individualScore !== null && group !== null
          ? Math.round((d.individualScore - group) * 100) / 100
          : null,
      ratings: ratingsOf(d, input.session.format),
      oldRule: input.oldRuleSampleIds?.has(d.sessionSampleId) === true,
    });
  }
  if (rows.length === 0) return null;
  return rows.sort(
    (a, b) =>
      a.cupperName.localeCompare(b.cupperName) || a.sampleLabel.localeCompare(b.sampleLabel),
  );
}

export type MyLateNotice =
  | { kind: "left_out"; sampleId: string; sampleLabel: string }
  | { kind: "included"; sampleId: string; sampleLabel: string; at: string };

/** The viewer's OWN complete drafts the close left out, and their own evaluations
 *  the owner accepted. Only the viewer's rows are ever passed in
 *  (`mine`, already filtered by cupper), and only closed group sessions yield
 *  anything. An excluded viewer gets nothing. */
export function buildMyLateNotices(input: {
  isGroup: boolean;
  session: { status: string; format: string };
  mine: (LateDraftInput & { acceptedLateAt: Date | null })[];
  sampleLabels: Map<string, string>;
  viewerExcluded?: boolean;
}): MyLateNotice[] {
  if (!input.isGroup || input.session.status !== "closed" || input.viewerExcluded === true) return [];
  const out: MyLateNotice[] = [];
  for (const e of input.mine) {
    const label = input.sampleLabels.get(e.sessionSampleId) ?? "";
    if (!e.isDraft && e.acceptedLateAt) {
      out.push({ kind: "included", sampleId: e.sessionSampleId, sampleLabel: label, at: e.acceptedLateAt.toISOString() });
    } else if (isAcceptableLate(e, input.session)) {
      out.push({ kind: "left_out", sampleId: e.sessionSampleId, sampleLabel: label });
    }
  }
  return out;
}

// ─── C1c: a note left only on the device ────────────────────────────────────

export type LateDraftWriteDecision = "create" | "update" | "stale" | "conflict";

/** What `submitLateDraft` does with the row that exists for (sample, cupper).
 *  Never an overwrite of a SUBMITTED row (`conflict`). A draft the server already
 *  had when the session closed (`receivedLateAt` NULL) is never replaced after the
 *  close either: `conflict`, the organizer can accept THAT version. A draft that
 *  itself arrived late (`receivedLateAt` set) is updated only if the device copy is
 *  not older than what the server stored (`stale` = the server already holds newer
 *  data, nothing written). No row: create. */
export function planLateDraftWrite(input: {
  existing: { isDraft: boolean; lastClientWriteAt: Date | null; receivedLateAt: Date | null } | null;
  clientTs: unknown;
  now?: number;
}): LateDraftWriteDecision {
  const { existing } = input;
  if (!existing) return "create";
  if (!existing.isDraft) return "conflict";
  if (existing.receivedLateAt === null) return "conflict";
  return shouldApplyClientWrite(existing.lastClientWriteAt, input.clientTs, input.now) ? "update" : "stale";
}

/** Whether an offline module is complete enough to offer "Enviar al organizador":
 *  only the three evaluation modules (physical/extrinsic are owner-only per-sample
 *  rows), complete by the same rule as above. */
export function isModuleSendable(moduleKey: string, data: Record<string, unknown>): boolean {
  if (moduleKey !== "descriptive" && moduleKey !== "affective" && moduleKey !== "combined") return false;
  return isEvaluationComplete(
    {
      cupperId: "",
      isDraft: true,
      descriptiveData: moduleKey === "descriptive" ? data : {},
      affectiveData: moduleKey === "affective" ? data : {},
      combinedData: moduleKey === "combined" ? data : {},
    },
    moduleKey,
  );
}

// ─── C2: a text note after the close ────────────────────────────────────────

/** The note text to store, or null for "clear it". Throws `invalid_input` for a
 *  non-string or a note over `POST_CLOSE_NOTE_MAX` characters. */
export function normalizePostCloseNote(text: unknown): string | null {
  return v.str(text, "text", { max: POST_CLOSE_NOTE_MAX, required: false });
}

/** The caller may write the note only on their OWN, SUBMITTED evaluation of a
 *  CLOSED session. */
export function postCloseNoteAllowed(input: {
  sessionStatus: string;
  evaluation: { cupperId: string; isDraft: boolean };
  userId: string;
}): boolean {
  return (
    input.sessionStatus === "closed" &&
    input.evaluation.cupperId === input.userId &&
    !input.evaluation.isDraft
  );
}

export type PostCloseNoteEval = {
  id: string;
  cupperId: string;
  sessionSampleId: string;
  isDraft: boolean;
  postCloseNote: string | null;
  postCloseNoteAt: Date | null;
};

export type MyPostCloseNote = { evaluationId: string; text: string | null; at: string | null };
export type CupperPostCloseNote = { text: string; at: string | null };

export type PostCloseNotesPayload = {
  /** The viewer's own submitted evaluations of a closed session, keyed by sample id. */
  mine: Record<string, MyPostCloseNote>;
  /** Owner lens only: every OTHER cupper's notes, cupper id -> sample id -> note. null otherwise. */
  byCupper: Record<string, Record<string, CupperPostCloseNote>> | null;
};

/** Who may read a post-close note: the cupper who wrote it, and the session
 *  owner (owner lens). Never another participant, never a report tier, never the
 *  CSV. The caller passes the owner lens; participants get `byCupper: null`
 *  and `mine` filtered to their own id, whatever rows they pass in. */
export function buildPostCloseNotes(input: {
  sessionStatus: string;
  ownerLens: boolean;
  viewerId: string;
  evals: PostCloseNoteEval[];
}): PostCloseNotesPayload {
  const empty: PostCloseNotesPayload = { mine: {}, byCupper: null };
  if (input.sessionStatus !== "closed") return empty;
  const mine: Record<string, MyPostCloseNote> = {};
  const byCupper: Record<string, Record<string, CupperPostCloseNote>> = {};
  for (const e of input.evals) {
    if (e.isDraft) continue;
    if (e.cupperId === input.viewerId) {
      mine[e.sessionSampleId] = {
        evaluationId: e.id,
        text: e.postCloseNote,
        at: e.postCloseNoteAt ? e.postCloseNoteAt.toISOString() : null,
      };
    } else if (input.ownerLens && e.postCloseNote) {
      (byCupper[e.cupperId] ??= {})[e.sessionSampleId] = {
        text: e.postCloseNote,
        at: e.postCloseNoteAt ? e.postCloseNoteAt.toISOString() : null,
      };
    }
  }
  return { mine, byCupper: input.ownerLens ? byCupper : null };
}
