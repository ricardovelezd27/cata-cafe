"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { completeGuestOnboarding } from "@/app/actions/community";
import { joinSessionAsGuest } from "@/app/actions/join";

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
    /** errors.codes copy, keyed by ActionErrorCode */
    codes: Record<string, string>;
  };
}

/**
 * Lets a walk-up participant join a group session without creating an
 * account: Supabase anonymous sign-in, then a Profile upsert, then the
 * existing invite-token join flow. Requires "Allow anonymous sign-ins" to be
 * enabled in the Supabase dashboard (see CLAUDE.md Supabase Manual Steps) and
 * PHASE 13 of rls_and_triggers.sql applied first.
 */
export function GuestJoinForm({ token, locale, translations }: GuestJoinFormProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: trimmed } },
      });
      if (signInError) {
        setError(translations.error);
        setIsSubmitting(false);
        return;
      }

      await completeGuestOnboarding(trimmed);
      // The join redirects server-side on success (NEXT_REDIRECT, handled by
      // Next — never swallow it); a refusal comes back as an ActionResult.
      const result = await joinSessionAsGuest(token, locale);
      if (!result.ok) {
        setError(translations.codes[result.error] ?? translations.error);
        setIsSubmitting(false);
      }
    } catch (err) {
      const digest = (err as { digest?: string } | undefined)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      setError(translations.error);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={translations.namePlaceholder}
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
      {error && <p className="text-sm text-red-defect">{error}</p>}
      <p className="text-xs text-brown-mid">{translations.offlineNotice}</p>
      <p className="text-xs text-brown-mid">{translations.dataNotice}</p>
    </form>
  );
}
