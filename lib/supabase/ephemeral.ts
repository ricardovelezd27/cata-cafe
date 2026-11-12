import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Anon-key Supabase client that can neither read nor write the browser's
 * cookies and keeps nothing: `persistSession: false` makes auth-js use an
 * in-memory storage for this instance only (GoTrueClient constructor), and
 * there is no cookie adapter at all (plain supabase-js, not @supabase/ssr).
 *
 * Used to verify an email token WITHOUT signing the browser in (S9-02, A-08):
 * `verifyOtp` returns the session tokens and user but the browser's current
 * session is untouched. Create one per call; never share it.
 */
export function createEphemeralClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
