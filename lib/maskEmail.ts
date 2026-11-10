// Masks an address for display next to people who are not its owner
// ("j***@dominio.com"). Pure; shared by the group page, the roster and the
// send-result rows (S8-03, F-grupos-3).

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Display label of a group member: the name when there is one, else a masked
 *  address. A LINKED member (an account) never exposes even the domain: their
 *  address was resolved server-side from a user id and the owner never typed
 *  it, so the fallback is "j***" with no "@". An email-only invitee keeps the
 *  masked address so the owner can still tell the rows apart. */
export function memberLabel(m: {
  displayName?: string | null;
  email: string;
  userId?: string | null;
}): string {
  const name = m.displayName?.trim();
  if (name) return name;
  if (m.userId) {
    const first = m.email.trim().slice(0, 1);
    return first ? `${first}***` : "***";
  }
  return maskEmail(m.email);
}
