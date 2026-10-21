// Same-origin relative path guard for `next` params that are used as a
// redirect target. Accepts only "/path…" — rejects scheme-relative ("//x"),
// backslash tricks and absolute URLs.
export function safeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  return next;
}
