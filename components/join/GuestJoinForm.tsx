"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { completeGuestOnboarding } from "@/app/actions/community";
import { checkJoinable, joinSessionAsGuest } from "@/app/actions/join";

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
 * user is created, an anonymous session left by an earlier failed try is
 * reused (five retries create one user, not five), the Supabase rate limit
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
      if (existing && !existing.is_anonymous) {
        // A registered user is signed in (stale page, another tab): never
        // replace their session. Re-render so the server shows the signed-in
        // join form.
        router.refresh();
        setIsSubmitting(false);
        return;
      }
      if (!existing) {
        const { error: signInError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: trimmed } },
        });
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
