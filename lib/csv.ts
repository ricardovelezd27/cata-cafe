// Tiny shared CSV helpers (pure). Extracted from lib/analytics/usersCsv.ts so the
// session results export (S8-12) escapes cells the same way.

/** Neutralises spreadsheet formula injection (a leading = + - @ tab CR becomes
 *  text), then quotes when the cell holds a comma, quote or line break. */
export function csvCell(s: string): string {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map((c) => csvCell(c === null || c === undefined ? "" : String(c))).join(",");
}

/** UTF-8 byte order mark so Excel opens accents correctly. */
export const CSV_BOM = "﻿";
