// Production environment assertions. Called once at server start from
// instrumentation.ts register(). A missing value here would not crash the
// app — it would quietly do the wrong thing (a printed QR pointing at
// localhost, silently skipped emails, a disabled cron), which is worse. So in
// production the boot fails loudly with the list of missing names; in
// development it only warns.
//
// NEXT_PUBLIC_* values are inlined at build time, so the check for those is
// on the build machine's env as well — Vercel injects Production env vars
// into the build, which is what we want.

export const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "GUEST_CLAIM_SECRET",
  "CRON_SECRET",
  "RESEND_API_KEY",
] as const;

type EnvLike = Record<string, string | undefined>;

export function missingProductionEnv(env: EnvLike = process.env): string[] {
  return REQUIRED_IN_PRODUCTION.filter((name) => !env[name] || env[name]!.trim() === "");
}

export function assertProductionEnv(env: EnvLike = process.env): void {
  const missing = missingProductionEnv(env);
  if (missing.length === 0) return;
  const message = `[env] missing required environment variables: ${missing.join(", ")} — see docs/LAUNCH-RUNBOOK.md §3`;
  if (env.NODE_ENV === "production") throw new Error(message);
  console.warn(message);
}
