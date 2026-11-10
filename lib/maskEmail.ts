// Masks an address for display next to people who are not its owner
// ("j***@dominio.com"). Pure; shared by the group page, the roster and the
// send-result rows (S8-03, F-grupos-3).

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
