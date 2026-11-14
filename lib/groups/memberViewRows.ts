import { memberRosterForMember } from "@/lib/groupRoster";

// The pure half of the group page's member view (S10 WP6 B6, review of #128): it
// turns the raw member rows (which carry an address and a profile) into rows that
// carry ONLY the keys below, built key by key, never by spreading the source row.
// `MEMBER_VIEW_KEYS` is the typed allow-list the tests assert against, so a change
// that lets an address (or the whole profile) through by any route fails a test on
// the returned objects rather than on the source text.

export type MemberViewRow = {
  id: string;
  userId: string | null;
  emailOptOutAt: Date | null;
  label: string;
};

/** The keys a member row of the viewer's group page may carry. Sorted. */
export const MEMBER_VIEW_KEYS = ["emailOptOutAt", "id", "label", "userId"] as const satisfies readonly (keyof MemberViewRow)[];

export type RawMemberRow = {
  id: string;
  userId: string | null;
  displayName: string | null;
  email: string;
  emailOptOutAt: Date | null;
  user: { displayName: string | null } | null;
};

export function toMemberViewRows(
  members: readonly RawMemberRow[],
  labels: { pending: string; member: string },
): MemberViewRow[] {
  const labelById = new Map(
    memberRosterForMember(
      members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        profileName: m.user?.displayName ?? null,
        emails: [m.email],
        linked: !!m.userId,
      })),
      labels,
    ).map((r) => [r.id, r.label]),
  );
  // No `email` key and no spread of `m`: each key is copied by name.
  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    emailOptOutAt: m.emailOptOutAt,
    label: labelById.get(m.id) ?? labels.pending,
  }));
}
