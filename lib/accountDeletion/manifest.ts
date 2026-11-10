/**
 * Every place the database remembers a user (S8-07, F-cuenta-1, F-guest-8).
 *
 * One entry per `Profile` relation (a foreign key to profiles.id) and per BARE
 * user column (a user id or `u_<id>` key with no foreign key). Two rules per
 * entry:
 *
 *  - `merge`: what `mergeGuestData` (lib/guestClaim.ts) does when a guest is
 *    absorbed into an account. A real rule names the Prisma delegate the merge
 *    calls (`tx.<delegate>.`), and tests/profileRelations.test.ts asserts that
 *    text exists in the merge, so a forgotten table fails the build instead
 *    of silently dropping rows when the guest's Profile is deleted.
 *  - `onDelete`: the INTENDED rule for account deletion. deleteAccount is NOT
 *    built (architect decision, S8-07 #1: destructive, needs a tombstone design
 *    and owner choices). These rules are the contract it will implement.
 *
 * tests/profileRelations.test.ts parses prisma/schema.prisma and fails on any
 * relation or listed bare column that is missing here (or stale here). When
 * you add a table with a user FK: add it to the schema, to this list, and to
 * mergeGuestData, in the same change.
 */

export type MergeRule =
  /** Rows move to the signed-in account (`tx.<delegate>.updateMany` or per-row). */
  | { kind: "move"; delegate: string }
  /** Rows of the guest are deleted (no value to the account). */
  | { kind: "erase"; delegate: string }
  /** The column cannot carry a guest (no row ever exists for one). */
  | { kind: "not-applicable"; reason: string };

export type DeleteRule =
  /** Row goes with the account. */
  | "erase"
  /** Row stays, authorship moves to a deletion tombstone profile (anonymized). */
  | "reassign-tombstone"
  /** Solo / empty assets are deleted; those with other people go to the tombstone. */
  | "delete-if-solo-else-tombstone"
  /** FK is SET NULL by the database; free-text PII on the same row is wiped. */
  | "set-null-and-wipe-pii"
  /** Not tied to the user (kept as is). */
  | "keep";

export type ManifestEntry = {
  /** Prisma model name. */
  model: string;
  /** The column holding the user: an FK field (kind "relation") or a bare column. */
  field: string;
  kind: "relation" | "bare";
  merge: MergeRule;
  onDelete: DeleteRule;
  /** Short why, shown to the next reader. */
  note: string;
};

// TODO(E3/E4-owner): deleteAccount — every `onDelete` below is the intended
// rule, not an implemented one. E3: others keep results without the
// organizer's name (default (a)); E4: self-service plus a manual path for a
// lost mailbox. Open design points the builder must settle first: one
// tombstone per deletion (Evaluation is unique on [sessionSampleId, cupperId],
// so a single shared tombstone collides when two deleted users rated the same
// sample); delete the evaluations of an excluded cupper instead of reassigning
// them (the trigger only excludes through a SessionParticipant row, which
// cascades away); close live group sessions with closeSessionInternal first.
export const PROFILE_MANIFEST: readonly ManifestEntry[] = [
  // ── Relations that RESTRICT account deletion today ──────────────────────
  {
    model: "Coffee",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "coffee" },
    onDelete: "reassign-tombstone",
    note: "Coffees anonymize (owner-only soft delete) and keep their analytics attributes.",
  },
  {
    model: "CoffeeInvite",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "coffeeInvite" },
    onDelete: "erase",
    note: "Invite tokens die with their creator.",
  },
  {
    model: "CuppingSession",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "cuppingSession" },
    onDelete: "delete-if-solo-else-tombstone",
    note: "Solo sessions go through deleteSession; group sessions with others move to the tombstone after closeSessionInternal.",
  },
  {
    model: "Evaluation",
    field: "cupperId",
    kind: "relation",
    merge: { kind: "move", delegate: "evaluation" },
    onDelete: "reassign-tombstone",
    note: "Anonymized, not erased, so community scores and SD do not move (spec 7); excluded cuppers' rows are deleted.",
  },
  {
    model: "PhysicalEvaluation",
    field: "evaluatedBy",
    kind: "relation",
    merge: { kind: "move", delegate: "physicalEvaluation" },
    onDelete: "reassign-tombstone",
    note: "Per-sample, owner authored.",
  },
  {
    model: "ExtrinsicData",
    field: "revealedBy",
    kind: "relation",
    merge: { kind: "move", delegate: "extrinsicData" },
    onDelete: "reassign-tombstone",
    note: "Nullable author of the reveal.",
  },
  {
    model: "SessionInvite",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "sessionInvite" },
    onDelete: "erase",
    note: "Invite tokens die with their creator.",
  },
  // ── Relations that CASCADE on profile delete (data would vanish) ────────
  {
    model: "CoffeeShare",
    field: "userId",
    kind: "relation",
    merge: { kind: "move", delegate: "coffeeShare" },
    onDelete: "erase",
    note: "Shares granted TO the user.",
  },
  {
    model: "SessionParticipant",
    field: "userId",
    kind: "relation",
    merge: { kind: "move", delegate: "sessionParticipant" },
    onDelete: "erase",
    note: "Participation rows; the trigger reads excludedFromResults off them.",
  },
  {
    model: "UserCoffeeHistory",
    field: "userId",
    kind: "relation",
    merge: { kind: "move", delegate: "userCoffeeHistory" },
    onDelete: "erase",
    note: "The user's own tasting history (snapshots included).",
  },
  {
    model: "SavedInsight",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "savedInsight" },
    onDelete: "erase",
    note: "Private saved analytics.",
  },
  {
    model: "TastingGroup",
    field: "createdBy",
    kind: "relation",
    merge: { kind: "move", delegate: "tastingGroup" },
    onDelete: "delete-if-solo-else-tombstone",
    note: "A cascade would delete groups that still have other members.",
  },
  {
    model: "GroupPost",
    field: "authorId",
    kind: "relation",
    merge: { kind: "move", delegate: "groupPost" },
    onDelete: "reassign-tombstone",
    note: "Posts in other people's groups survive without the author's name.",
  },
  // ── SET NULL ────────────────────────────────────────────────────────────
  {
    model: "TastingGroupMember",
    field: "userId",
    kind: "relation",
    merge: { kind: "move", delegate: "tastingGroupMember" },
    onDelete: "set-null-and-wipe-pii",
    note: "The FK nulls itself but the member row keeps the email: wipe it.",
  },
  // ── Bare user columns (no foreign key) ──────────────────────────────────
  {
    model: "CloseEmailDelivery",
    field: "userId",
    kind: "bare",
    merge: { kind: "erase", delegate: "closeEmailDelivery" },
    onDelete: "erase",
    note: "Ledger of close emails; a guest's rows are 'skipped' (no address), so the account must not inherit them.",
  },
  {
    model: "SessionReminderDelivery",
    field: "userId",
    kind: "bare",
    merge: { kind: "erase", delegate: "sessionReminderDelivery" },
    onDelete: "erase",
    note: "Ledger of deadline reminders (S8-05); a guest's rows are 'skipped' (no address), so the account must not inherit them.",
  },
  {
    model: "AiChatUsage",
    field: "userId",
    kind: "bare",
    merge: { kind: "move", delegate: "aiChatUsage" },
    onDelete: "erase",
    note: "Unique on [userId, day]: the merge sums into the target's row for the same day.",
  },
  {
    model: "OutboundEmailEvent",
    field: "actorKey",
    kind: "bare",
    merge: { kind: "move", delegate: "outboundEmailEvent" },
    onDelete: "erase",
    note: "actorKey is 'u_<userId>' (S8-03), so the throttle history follows the person.",
  },
  // ── Email-keyed, not user-keyed ─────────────────────────────────────────
  {
    model: "WaitlistEntry",
    field: "email",
    kind: "bare",
    merge: { kind: "not-applicable", reason: "keyed by email, a guest has none" },
    onDelete: "erase",
    note: "Removed by email on deletion.",
  },
];

/** Bare columns the test checks exist in the schema (relations are discovered from it). */
export const BARE_COLUMNS = PROFILE_MANIFEST.filter((e) => e.kind === "bare").map(
  (e) => `${e.model}.${e.field}`,
);

export function manifestKey(model: string, field: string): string {
  return `${model}.${field}`;
}
