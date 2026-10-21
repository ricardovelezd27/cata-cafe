// The ONE way to subscribe a Supabase Realtime channel from a client
// component (S6 CP-C4).
//
// Why: `createBrowserClient()` + `.subscribe()` in the same tick joins the
// channel with the ANON key — the user's session JWT is only applied to the
// realtime socket after the auth client has read the cookies, which happens
// asynchronously. Realtime then evaluates the RLS policies as `anon`;
// `is_session_participant` has no EXECUTE for anon (PHASE 18, by design), so
// walrus fails with "permission denied for function is_session_participant"
// (Supabase → Logs → Realtime) while the client still reports SUBSCRIBED and
// silently receives nothing. That is "results appear late / had to reload".
//
// This helper awaits the session, pushes the JWT to the socket, and only then
// subscribes. It also owns the cleanup so an effect that unmounts before the
// session resolves never leaks a channel. Never grant the function to anon
// instead of using this.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type SubscribeStatusCallback = Parameters<RealtimeChannel["subscribe"]>[0];

/** Minimal surface of the client used here — keeps the helper testable. */
export type RealtimeAuthClient = Pick<SupabaseClient, "removeChannel"> & {
  auth: { getSession: SupabaseClient["auth"]["getSession"] };
  realtime: { setAuth: (token?: string | null) => Promise<void> | void };
};

/**
 * Builds the channel with `build()` (bindings included, NOT subscribed) once
 * the user's JWT is on the realtime socket, then subscribes. Returns the
 * cleanup to call from the effect.
 */
export function subscribeWithSessionAuth(
  client: RealtimeAuthClient,
  build: () => RealtimeChannel,
  onStatus?: SubscribeStatusCallback,
): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) await client.realtime.setAuth(session.access_token);
    } catch {
      // No session (or auth storage unavailable): fall through and subscribe
      // anyway — the status callback still reports what Realtime says.
    }
    if (cancelled) return;
    channel = build();
    channel.subscribe(onStatus);
  })();

  return () => {
    cancelled = true;
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
  };
}
