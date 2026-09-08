// Structured, one-line JSON logging for the server. Vercel Logs indexes
// console output line by line, so a single JSON object per event is what
// makes `digest`, `action` or `sessionId` searchable there. Shared by
// lib/safeAction.ts (action failures) and instrumentation.ts (render/route
// failures) so both paths have the same shape.
//
// NEVER pass: request headers or cookies (Supabase tokens), the concrete
// path of /join/* or /auth/* URLs (tokens), emails, display names, form
// bodies, evaluation payloads, AI prompts. Ids (userId, sessionId, coffeeId)
// and the route TEMPLATE (e.g. /[locale]/join/[token]) are fine.

export type LogFields = {
  where: string;
  message?: string;
  code?: string;
  digest?: string;
  userId?: string;
  sessionId?: string;
  coffeeId?: string;
  groupId?: string;
  routePath?: string;
  routeType?: string;
  locale?: string;
  [extra: string]: string | number | boolean | null | undefined;
};

function line(level: "info" | "warn" | "error", fields: LogFields): string {
  return JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
}

export function logError(fields: LogFields): void {
  console.error(line("error", fields));
}

export function logWarn(fields: LogFields): void {
  console.warn(line("warn", fields));
}

export function logInfo(fields: LogFields): void {
  console.info(line("info", fields));
}

/** Collapses the last path segment of token-bearing routes so a concrete
 *  invite/claim/OTP token never reaches the logs. */
export function redactPath(pathname: string): string {
  if (/^\/(?:[a-z]{2}\/)?(?:join|auth)\//.test(pathname)) {
    return pathname.replace(/\/[^/]+(\/?)$/, "/…$1");
  }
  return pathname;
}

/** Bounded, safe rendering of an unknown thrown value for `message`. */
export function errorMessage(err: unknown, max = 300): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}
