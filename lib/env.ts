import { logWarn } from "@/lib/log";
import { parseSuperAdminEmail } from "@/lib/analytics/adminEmails";

// Production environment assertions. Called once at server start from
// instrumentation.ts register(). A missing value here would not crash the
// app — it would quietly do the wrong thing (a printed QR pointing at
// localhost, silently skipped emails, a disabled cron), which is worse. So in
// production the server REFUSES TO START (register() throws on every cold
// start) with the list of missing names; in development it only warns. This
// does not fail the build: the deployment goes Ready and then returns 500s, so
// a preview deployment of a change is the test.
//
// NEXT_PUBLIC_* values are inlined at build time, so the check for those is
// on the build machine's env as well — Vercel injects Production env vars
// into the build, which is what we want.

// Optional (NOT asserted, no new required var):
//   CLOSE_EMAIL_ATTACH_CVA=1  legacy close-email behaviour — also attach each
//                             participant's own CVA form PDF next to the
//                             personal summary PDF (default: summary only).
//
export const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "GUEST_CLAIM_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "ANALYTICS_SUPER_ADMIN_EMAIL",
] as const;

type EnvLike = Record<string, string | undefined>;

export function missingProductionEnv(env: EnvLike = process.env): string[] {
  return REQUIRED_IN_PRODUCTION.filter((name) => {
    // The super-admin must be exactly one valid address; a list or a typo
    // counts as missing (it would boot and leave no administrator).
    if (name === "ANALYTICS_SUPER_ADMIN_EMAIL") return parseSuperAdminEmail(env) === null;
    return !env[name] || env[name]!.trim() === "";
  });
}

// Variables that SHOULD be set in production but must not stop the boot: the
// code has a safe fallback (UNSUBSCRIBE_SECRET falls back to
// GUEST_CLAIM_SECRET). The boot logs one warning until they are set.
// ANALYTICS_SUPER_ADMIN_EMAIL is REQUIRED (F-insights-5): without it nobody is
// super-admin, and there is no address hard-coded in lib/analytics/access.ts.
export const RECOMMENDED_IN_PRODUCTION = ["UNSUBSCRIBE_SECRET"] as const;

export function missingRecommendedEnv(env: EnvLike = process.env): string[] {
  return RECOMMENDED_IN_PRODUCTION.filter((name) => !env[name] || env[name]!.trim() === "");
}

export function warnRecommendedEnv(env: EnvLike = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const missing = missingRecommendedEnv(env);
  if (missing.length === 0) return;
  logWarn({
    where: "env",
    message: `recommended environment variables not set: ${missing.join(", ")} — see docs/LAUNCH-RUNBOOK.md §17`,
  });
}

export function assertProductionEnv(env: EnvLike = process.env): void {
  warnRecommendedEnv(env);
  const missing = missingProductionEnv(env);
  if (missing.length === 0) return;
  const message = `[env] missing or invalid required environment variables: ${missing.join(", ")} — see docs/LAUNCH-RUNBOOK.md §3`;
  if (env.NODE_ENV === "production") throw new Error(message);
  console.warn(message);
}
