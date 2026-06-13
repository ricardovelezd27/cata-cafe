"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";

type Labels = {
  label: string;
  emailPlaceholder: string;
  button: string;
  submitting: string;
  success: string;
  invalid: string;
  error: string;
};

export default function WaitlistForm({
  locale,
  labels,
}: {
  locale: string;
  labels: Labels;
}) {
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(
    joinWaitlist,
    { status: "idle" },
  );

  if (state.status === "ok") {
    return (
      <p
        role="status"
        className="rounded-2xl bg-primary-fixed/40 px-4 py-3 text-sm text-primary"
      >
        {labels.success}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="waitlist-email" className="sr-only">
        {labels.label}
      </label>
      {/* Honeypot — hidden from real users */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name="locale" value={locale} />
      {/* Stacked, not inline: the card column gets narrow at lg, and an
          email input must never truncate its own placeholder. */}
      <div className="flex flex-col gap-2">
        <input
          id="waitlist-email"
          type="email"
          name="email"
          required
          placeholder={labels.emailPlaceholder}
          className="w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary-container"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-primary-container px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60"
        >
          {pending ? labels.submitting : labels.button}
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-xs text-error">
          {state.code === "invalid_email" ? labels.invalid : labels.error}
        </p>
      )}
    </form>
  );
}
