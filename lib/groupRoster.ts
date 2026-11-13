// What a group MEMBER (anyone who is not the group's owner) may see of the roster
// (S10 WP5a, D7 / F-grupos-10). Every member sees NAMES; nobody but the owner sees
// an email in any form: not whole, not masked, not an initial, not a domain. A
// member with no name yet (invited by email, never signed in) is "Invitación
// pendiente".
//
// Pure and dependency-free so the rule is pinned by tests. The page also leaves
// the `email` column out of the query it runs for a member, so the address never
// even reaches the render; this mapper is the second wall.
//
// TODO(kim-validar:D7)

export type MemberRosterSource = {
  id: string;
  /** The name the owner gave the member row, if any. */
  displayName?: string | null;
  /** The linked account's own display name, if the member has signed in. */
  profileName?: string | null;
};

/** The only fields a member's payload carries per roster row. */
export type MemberRosterRow = { id: string; label: string };

export function memberRosterForMember(
  members: MemberRosterSource[],
  pendingLabel: string,
): MemberRosterRow[] {
  return members.map((m) => ({
    id: m.id,
    label: m.displayName?.trim() || m.profileName?.trim() || pendingLabel,
  }));
}
