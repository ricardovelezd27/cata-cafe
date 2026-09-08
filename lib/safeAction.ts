import "server-only";

import { unstable_rethrow } from "next/navigation";
import { type ActionResult, classifyActionError } from "@/lib/actionResult";
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
//   2. classifyActionError (lib/actionResult.ts): known code strings
//      (Error("not_found_or_forbidden") etc. from lib/auth, lib/sessionAuth,
//      community.ts) and Prisma P2002/P2025/P2003 → { ok: false, error }.
//   3. Anything else → logged as one JSON line (action name, message, ids —
//      never payloads) and returned as { ok: false, error: "unknown" }.
//
// Actions that are only called from server pages, or whose failure is
// already handled by ConfirmDialog, may keep throwing — see CLAUDE.md
// "Server Action Contract".

export { classifyActionError } from "@/lib/actionResult";

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
