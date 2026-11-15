"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { subscribeNewsletter, type NewsletterState } from "@/app/actions/waitlist";

type Labels = {
  label: string;
  emailPlaceholder: string;
  button: string;
  submitting: string;
  success: string;
  invalid: string;
  error: string;
  rateLimit: string;
};

/**
 * The newsletter sign-up of the closing block: the page's SECOND ask, so it
 * is visibly quieter than the founding card (no card around it, an outlined
 * button, one row from 640px). It records the address and the consent; it
 * sends nothing (app/actions/waitlist.ts `subscribeNewsletter`).
 *
 * The notice under the field is the consent text: who is responsible, what
 * the address is used for, how to stop. It is always shown.
 */
export default function NewsletterForm({
  locale,
  labels,
  notice,
}: {
  locale: string;
  labels: Labels;
  notice: { text: string; linkLabel: string; href: string };
}) {
  const emailId = useId();
  const [state, formAction, pending] = useActionState<NewsletterState, FormData>(subscribeNewsletter, {
    status: "idle",
  });
  // A campaign tag from ?src=, read in an effect so the page stays static.
  const srcRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("src") ?? "";
      if (srcRef.current && /^[a-zA-Z0-9_-]{1,24}$/.test(raw)) srcRef.current.value = raw;
    } catch {
      /* no URL access: no tag */
    }
  }, []);

  if (state.status === "ok") {
    return (
      <p role="status" className="mx-auto max-w-md rounded-2xl bg-surface/10 px-4 py-3 text-sm text-surface">
        {labels.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="mx-auto max-w-md">
      <label htmlFor={emailId} className="sr-only">
        {labels.label}
      </label>
      {/* Honeypot: hidden from real users. */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="src" ref={srcRef} defaultValue="" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          className="min-h-[44px] w-full rounded-2xl border border-surface/25 bg-surface/10 px-4 text-sm text-surface placeholder:text-surface/55 focus:outline-none focus:ring-2 focus:ring-primary-fixed"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-[44px] shrink-0 rounded-2xl border border-surface/45 px-5 text-sm font-semibold text-surface transition-colors hover:bg-surface/10 disabled:opacity-60"
        >
          {pending ? labels.submitting : labels.button}
        </button>
      </div>
      <p className="mt-3 text-xs leading-snug text-surface/70">
        {notice.text}{" "}
        <Link href={notice.href} className="underline underline-offset-2">
          {notice.linkLabel}
        </Link>
      </p>
      {state.status === "error" && (
        <p role="alert" className="mt-2 text-xs text-secondary-container">
          {state.code === "invalid_email" ? labels.invalid : state.code === "rate_limit" ? labels.rateLimit : labels.error}
        </p>
      )}
    </form>
  );
}
