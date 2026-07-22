"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { completeGuestOnboarding, joinViaToken } from "@/app/actions/community";

interface GuestJoinFormProps {
  token: string;
  locale: string;
  translations: {
    namePlaceholder: string;
    joinButton: string;
    joining: string;
    offlineNotice: string;
    error: string;
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
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;

    setError(false);
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: trimmed } },
      });
      if (signInError) {
        setError(true);
        setIsSubmitting(false);
        return;
      }

      await completeGuestOnboarding(trimmed);
      // joinViaToken redirects server-side on success (throws NEXT_REDIRECT
      // internally) — Next handles the navigation, so we must not swallow it.
      await joinViaToken(token, locale);
    } catch (err) {
      const digest = (err as { digest?: string } | undefined)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        throw err;
      }
      setError(true);
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
      {error && <p className="text-sm text-red-defect">{translations.error}</p>}
      <p className="text-xs text-brown-mid">{translations.offlineNotice}</p>
    </form>
  );
}
