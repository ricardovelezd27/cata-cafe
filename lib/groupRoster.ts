// What a group MEMBER (anyone who is not the group's owner) may see of the roster
// (S10 WP5a, D7 / F-grupos-10). Every member sees NAMES; nobody but the owner sees
// an email in any form: not whole, not masked, not an initial, not a domain, and
// not the local part of it either. A profile's display name DEFAULTS to the email
// local part (handle_new_user, profile fallbacks), so a profile name that looks
// like the address is treated as "no name" (review H2).
//
// Pure and dependency-free so the rule is pinned by tests. The server-only loader
// (lib/groups/memberView.ts) applies it BEFORE anything reaches the page, so the
// address never even reaches the render.
//
// TODO(kim-validar:D7)

export type MemberRosterSource = {
  id: string;
  /** The name the owner gave the member row, if any. */
  displayName?: string | null;
  /** The linked account's own display name, if the member has signed in. */
  profileName?: string | null;
  /** The member row's stored address and the linked account's address when known. SERVER ONLY. */
  emails?: (string | null | undefined)[];
  /** True when the row is linked to an account. */
  linked?: boolean;
};

/** The only fields a member's payload carries per roster row. */
export type MemberRosterRow = { id: string; label: string };

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** True when `name` equals, case-insensitively and trimmed, the local part or the
 *  whole of any of `emails`, or contains an "@". */
export function looksLikeAddress(
  name: string,
  emails: (string | null | undefined)[],
): boolean {
  const n = norm(name);
  if (!n) return false;
  if (n.includes("@")) return true;
  for (const e of emails) {
    if (!e) continue;
    const full = norm(e);
    if (!full) continue;
    const at = full.indexOf("@");
    const local = at > 0 ? full.slice(0, at) : full;
    if (n === full || n === local) return true;
  }
  return false;
}

export function memberRosterForMember(
  members: MemberRosterSource[],
  labels: { pending: string; member: string },
): MemberRosterRow[] {
  return members.map((m) => {
    const own = m.displayName?.trim();
    if (own && !looksLikeAddress(own, m.emails ?? [])) return { id: m.id, label: own };
    const profile = m.profileName?.trim();
    if (profile && !looksLikeAddress(profile, m.emails ?? [])) return { id: m.id, label: profile };
    return { id: m.id, label: m.linked ? labels.member : labels.pending };
  });
}
