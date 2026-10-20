// Pure CSV builder for the registered-users export (no server imports so the
// vitest suite can cover it). Same output as scripts/export-emails.ts.

export interface ExportUser {
  email: string | null;
  isAnonymous: boolean;
  createdAt: string | null;
}

function csvCell(s: string): string {
  // Neutralise spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Registered (non-anonymous, with an email) accounts as `email,created_at`, oldest first. */
export function buildRegisteredUsersCsv(users: ExportUser[]): { csv: string; count: number } {
  const rows = users
    .filter((u) => !u.isAnonymous && !!u.email)
    .map((u) => ({ email: (u.email as string).toLowerCase(), createdAt: u.createdAt ?? "" }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const csv =
    ["email,created_at", ...rows.map((r) => `${csvCell(r.email)},${csvCell(r.createdAt)}`)].join("\n") + "\n";
  return { csv, count: rows.length };
}
