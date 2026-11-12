"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeGuestOnboarding } from "@/app/actions/community";
import { existingUserAction } from "@/lib/joinRules";
import { checkJoinable, joinSessionAsGuest } from "@/app/actions/join";

// Per tab, best effort, never required: the anonymous user THIS tab created.
const CREATED_ANON_KEY = "cata_join_anon_created";
function readCreatedAnonId(): string | null {
  try {
    return window.sessionStorage.getItem(CREATED_ANON_KEY);
  } catch {
    return null;
  }
}
function rememberCreatedAnonId(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(CREATED_ANON_KEY, id);
  } catch {
    // best effort
  }
}
function forgetCreatedAnonId() {
  try {
    window.sessionStorage.removeItem(CREATED_ANON_KEY);
  } catch {
    // best effort
  }
}

interface GuestJoinFormProps {
  token: string;
  locale: string;
  translations: {
    namePlaceholder: string;
    joinButton: string;
    joining: string;
    offlineNotice: string;
    dataNotice: string;
    error: string;
    /** Copy per ActionErrorCode (closed / expired / full / rate-limited…). */
    errors: Record<string, string>;
  };
}

/**
 * Lets a walk-up participant join a group session without creating an
 * account: Supabase anonymous sign-in, then a Profile upsert, then the
 * existing invite-token join flow. Requires "Allow anonymous sign-ins" to be
 * enabled in the Supabase dashboard (see CLAUDE.md Supabase Manual Steps) and
 * PHASE 13 of rls_and_triggers.sql applied first.
 *
 * S8-07 (F-guest-3, F-guest-2): the invite is checked BEFORE any anonymous
 * user is created, five retries create one user, not five (an anonymous
 * session found at submit now sends the page back to the "¿Eres …?" screen,
 * S10 WP8, instead of being reused silently), the Supabase rate limit
 * has its own message, and every failure shows its own localized reason
 * instead of one generic line.
 */
export function GuestJoinForm({ token, locale, translations }: GuestJoinFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (code: string) => {
    setError(translations.errors[code] ?? translations.error);
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const joinable = await checkJoinable(token);
      if (!joinable.ok) return fail(joinable.error);

      const supabase = createClient();
      const {
        data: { user: existing },
      } = await supabase.auth.getUser();
      const action = existingUserAction(existing, readCreatedAnonId());
      if (action === "registered" || action === "identity") {
        // A registered user is signed in (stale page, another tab): never
        // replace their session. Or an anonymous user this tab did NOT create
        // (the previous guest on a shared device, S10 WP8 F-guest-4): never
        // reuse it silently. Re-render so the server shows the signed-in join
        // form or the "¿Eres …?" screen.
        router.refresh();
        setIsSubmitting(false);
        return;
      }
      // "reuse" = the anonymous user THIS tab created on an earlier failed try
      // (S8-07 F-guest-2): five retries create one user, not five.
      if (!existing) {
        const { data: created, error: signInError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: trimmed } },
        });
        rememberCreatedAnonId(created?.user?.id ?? null);
        if (signInError) {
          const limited =
            signInError.status === 429 ||
            signInError.code === "over_request_rate_limit" ||
            signInError.code === "over_email_send_rate_limit";
          return fail(limited ? "rate_limited" : "unknown");
        }
      }

      await completeGuestOnboarding(trimmed);

      // The join redirects server-side on success (NEXT_REDIRECT, handled by
      // Next — never swallow it); a refusal comes back as an ActionResult (S8-11).
      const result = await joinSessionAsGuest(token, locale);
      if (!result.ok) fail(result.error);
    } catch (err) {
      const digest = (err as { digest?: string } | undefined)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        forgetCreatedAnonId(); // the join succeeded
        throw err;
      }
      fail("unknown");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={translations.namePlaceholder}
        aria-label={translations.namePlaceholder}
        required
        autoComplete="name"
        className="w-full px-3 py-2.5 border border-brown-light rounded-input text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark"
      />
      <button
        type="submit"
        disabled={isSubmitting || !name.trim()}
        className="w-full py-3 rounded-pill bg-green-dark text-white font-bold hover:bg-green-mid transition disabled:opacity-50"
      >
        {isSubmitting ? translations.joining : translations.joinButton}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-defect">
          {error}
        </p>
      )}
      <p className="text-xs text-brown-mid">{translations.offlineNotice}</p>
      <p className="text-xs text-brown-mid">{translations.dataNotice}</p>
    </form>
  );
}
