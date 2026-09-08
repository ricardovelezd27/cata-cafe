// The result contract for server actions that are called INTERACTIVELY from
// client components (buttons, toggles, dialogs). Thrown errors reach the
// browser as an opaque digest in production, so an action the UI must react
// to returns this shape instead — via `run()` in lib/safeAction.ts.
//
// The discriminant key is `error` (not `code`): the actions that already
// returned `{ ok: false, error }` before this file existed keep working, and
// `messages.*.errors.<code>` is the single copy table for every code.
//
// Shared by server and client code — keep this file free of server imports.

export const ACTION_ERROR_CODES = [
  "not_authenticated",
  "not_found_or_forbidden",
  "session_closed",
  "invalid_token",
  "token_expired",
  "token_exhausted",
  "coffee_not_usable",
  "invalid_input",
  "conflict", // Prisma P2002 — unique constraint
  "not_found", // Prisma P2025 — row vanished (concurrent delete)
  "invalid_reference", // Prisma P2003 — FK target vanished
  "unknown",
] as const;

export type ActionErrorCode = (typeof ACTION_ERROR_CODES)[number];

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode };

export function isActionErrorCode(value: unknown): value is ActionErrorCode {
  return (
    typeof value === "string" &&
    (ACTION_ERROR_CODES as readonly string[]).includes(value)
  );
}

const PRISMA_CODE_MAP: Record<string, ActionErrorCode> = {
  P2002: "conflict",
  P2025: "not_found",
  P2003: "invalid_reference",
};

/** Maps anything thrown inside an action to an ActionErrorCode. Pure (no
 *  server imports) so lib/safeAction.ts and the unit tests share it:
 *  known code strings pass through, a legacy `forbidden` maps to
 *  `not_found_or_forbidden`, Prisma known-request errors are duck-typed on
 *  `.code` exactly like lib/coffeeCode.ts does, everything else is unknown. */
export function classifyActionError(err: unknown): ActionErrorCode {
  if (err instanceof Error) {
    if (isActionErrorCode(err.message)) return err.message;
    // Legacy throw from before the contract existed.
    if (err.message === "forbidden") return "not_found_or_forbidden";
  }
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code in PRISMA_CODE_MAP) return PRISMA_CODE_MAP[code];
  return "unknown";
}
