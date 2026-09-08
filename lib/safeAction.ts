import "server-only";

import { unstable_rethrow } from "next/navigation";
import { type ActionErrorCode, type ActionResult, isActionErrorCode } from "@/lib/actionResult";
import { errorMessage, logError } from "@/lib/log";

// Use INSIDE a server action body (not as a top-level wrapper, so "use server"
// files keep exporting plain async functions):
//
//   export async function revealSample(sampleId: string) {
//     return run("revealSample", async () => {
//       const user = await requireUser();
//       ...
//       return { sessionId };
//     });
//   }
//
// What it does with a throw, in order:
//   1. `unstable_rethrow` — lets redirect() / notFound() / forbidden() pass
//      through untouched (they are implemented as throws; swallowing them
//      would break every action that redirects on success).
//   2. Known code strings (Error("not_found_or_forbidden") etc. from lib/auth,
//      lib/sessionAuth, community.ts) → { ok: false, error: code } unchanged.
//   3. Prisma known-request errors, duck-typed on `.code` exactly like
//      lib/coffeeCode.ts does: P2002 → conflict, P2025 → not_found,
//      P2003 → invalid_reference.
//   4. Anything else → logged as one JSON line (action name, message, ids —
//      never payloads) and returned as { ok: false, error: "unknown" }.
//
// Actions that are only called from server pages, or whose failure is
// already handled by ConfirmDialog, may keep throwing — see CLAUDE.md
// "Server action contract".

const PRISMA_CODE_MAP: Record<string, ActionErrorCode> = {
  P2002: "conflict",
  P2025: "not_found",
  P2003: "invalid_reference",
};

export function classifyActionError(err: unknown): ActionErrorCode {
  if (err instanceof Error) {
    if (isActionErrorCode(err.message)) return err.message;
    // Legacy codes thrown before the contract existed.
    if (err.message === "forbidden" || err.message === "not_found") {
      return "not_found_or_forbidden";
    }
  }
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code in PRISMA_CODE_MAP) return PRISMA_CODE_MAP[code];
  return "unknown";
}

export async function run<T>(
  name: string,
  fn: () => Promise<T>,
  ctx: { userId?: string; sessionId?: string; coffeeId?: string; groupId?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    unstable_rethrow(err);
    const error = classifyActionError(err);
    if (error === "unknown") {
      logError({
        where: `action.${name}`,
        message: errorMessage(err),
        digest: (err as { digest?: string } | null)?.digest,
        ...ctx,
      });
    }
    return { ok: false, error };
  }
}
