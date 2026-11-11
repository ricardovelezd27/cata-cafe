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
 *  - `onDelete`: the rule deleteAccount (lib/accountDeletion/deleteAccount.ts,
 *    S8-19) implements. tests/profileRelations.test.ts asserts a matching
 *    statement exists there WHOSE `where` FILTERS BY THIS ENTRY'S FIELD and the
 *    user (`<field>: userId`), or, for id-list deletes, by a named id list the
 *    test knows: `tx.<delegate>.deleteMany` for "erase",
 *    `tx.<delegate>.updateMany` for "reassign-tombstone", and both a delete and
 *    an updateMany for "delete-if-solo-else-tombstone".
 *
 * tests/profileRelations.test.ts parses prisma/schema.prisma and fails on any
 * relation or listed bare column that is missing here (or stale here). When
 * you add a table with a user FK: add it to the schema, to this list, to
 * mergeGuestData AND to deleteAccount, in the same change.
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
  /** Row stays, authorship moves to the deletion's own placeholder profile
   *  `deleted_<random>` (lib/accountDeletion/deletedProfile.ts). */
  | "reassign-tombstone"
  /** Solo / empty assets are deleted; those with other people go to the tombstone. */
  | "delete-if-solo-else-tombstone"
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
  /** Prisma delegate deleteAccount uses when the merge rule names none. */
  deleteDelegate?: string;
};

/** The Prisma delegate deleteAccount touches for this entry. */
export function deletionDelegate(e: ManifestEntry): string | null {
  if (e.deleteDelegate) return e.deleteDelegate;
  return e.merge.kind === "not-applicable" ? null : e.merge.delegate;
}

// E3 default (a): others keep their results without the person's name; E4 (a):
// self-service deletion. TODO(E3-Kim): every "reassign-tombstone" and
// "delete-if-solo-else-tombstone" rule changes if Kim prefers erasure or an
// ownership transfer. TODO(E4-Kim): the manual lost-mailbox path stays in the
// runbook (§16).
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
    note: "Anonymized, not erased, so community scores and SD do not move (spec 7). An excluded cupper stays excluded: their participant row moves with its flag.",
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
    onDelete: "reassign-tombstone",
    note: "Moved WITH excludedFromResults and its trail: the trigger reads the flag off the row, and the participant count must not change.",
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
  // ── SET NULL in the database ────────────────────────────────────────────
  {
    model: "TastingGroupMember",
    field: "userId",
    kind: "relation",
    merge: { kind: "move", delegate: "tastingGroupMember" },
    onDelete: "erase",
    note: "The FK would null itself but the row keeps the email: the person's member rows (by id or by address) are deleted.",
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
    model: "SessionParticipant",
    field: "excludedBy",
    kind: "bare",
    merge: {
      kind: "not-applicable",
      reason: "a guest owns no session, so it never excludes anyone; moved rows keep the value as is",
    },
    onDelete: "reassign-tombstone",
    note: "S8-12 exclusion trail on kept rows: who excluded the cupper now reads as the placeholder.",
    deleteDelegate: "sessionParticipant",
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
    deleteDelegate: "waitlistEntry",
  },
];

/** Bare columns the test checks exist in the schema (relations are discovered from it). */
export const BARE_COLUMNS = PROFILE_MANIFEST.filter((e) => e.kind === "bare").map(
  (e) => `${e.model}.${e.field}`,
);

export function manifestKey(model: string, field: string): string {
  return `${model}.${field}`;
}
