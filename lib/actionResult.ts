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
