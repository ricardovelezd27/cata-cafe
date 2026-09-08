"use client";

import { useActionState } from "react";
import Link from "next/link";
import { joinSessionForm, type JoinFormState } from "@/app/actions/join";
import { Button } from "@/components/ui";

export type JoinSessionFormTranslations = {
  button: string;
  pending: string;
  /** Keyed by ActionErrorCode (falls back to `unknown`). */
  errors: Record<string, string>;
  home: string;
};

/**
 * React 19 useActionState wrapper around joinSessionForm (app/actions/join.ts).
 * A successful join redirects server-side (thrown NEXT_REDIRECT passes
 * through run() untouched); a failure resolves to an ActionResult the form
 * renders inline instead of crashing the page.
 */
export function JoinSessionForm({
  token,
  locale,
  translations: t,
}: {
  token: string;
  locale: string;
  translations: JoinSessionFormTranslations;
}) {
  const [state, formAction, isPending] = useActionState<JoinFormState, FormData>(
    joinSessionForm,
    null,
  );

  const errorMessage = state && !state.ok ? (t.errors[state.error] ?? t.errors.unknown) : null;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? t.pending : t.button}
      </Button>
      {errorMessage && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-error">{errorMessage}</p>
          <Link
            href={`/${locale}/app`}
            className="text-sm text-on-surface-variant underline hover:text-on-surface"
          >
            {t.home}
          </Link>
        </div>
      )}
    </form>
  );
}
