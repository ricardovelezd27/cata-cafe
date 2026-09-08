// Next.js server instrumentation (project root — never inside app/).
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
//
// onRequestError fires for every error the Next server captures while
// rendering a page, running a route handler, a server action or the proxy.
// It is the ONLY place a production render failure becomes visible: the user
// sees a digest on the error boundary (components/errors/ErrorPanel.tsx shows
// it as "código de soporte"); this hook writes the same digest to Vercel Logs
// as one JSON line so the two can be matched. Shape shared with lib/log.ts.
//
// What is logged: digest, message, route TEMPLATE, route type, method, locale.
// What is NOT: headers/cookies (Supabase tokens), the concrete path of
// /join/* and /auth/* (invite / claim / OTP tokens), any body.

import type { Instrumentation } from "next";
import { errorMessage, logError, redactPath } from "@/lib/log";
import { assertProductionEnv } from "@/lib/env";

// Runs once per server instance at startup (Node runtime only — the edge
// runtime has no process.env to assert). Fails the boot in production when a
// required variable is missing instead of shipping localhost links or
// silently skipped emails.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionEnv();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const digest = (err as { digest?: unknown } | null)?.digest;
  const localeMatch = /^\/(es|en)(?:\/|$)/.exec(request.path);
  logError({
    where: `request.${context.routeType}`,
    digest: typeof digest === "string" ? digest : undefined,
    message: errorMessage(err),
    routePath: context.routePath,
    // The concrete path only when it cannot carry a token.
    path: redactPath(request.path),
    routeType: context.routeType,
    method: request.method,
    locale: localeMatch?.[1],
    renderSource: context.renderSource,
  });
};
