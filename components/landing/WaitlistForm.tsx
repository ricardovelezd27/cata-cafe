"use client";

import { useActionState } from "react";
import { reserveFoundingSeat, type WaitlistState } from "@/app/actions/waitlist";

type Labels = {
  label: string;
  emailPlaceholder: string;
  button: string;
  submitting: string;
  success: string;
  sentHint: string;
  invalid: string;
  error: string;
  rateLimit: string;
};

// onDark: glass card on the green stage. onLight: the solid cream hero card.
const STYLES = {
  onDark: {
    success: "stage-card rounded-2xl px-4 py-3 text-sm text-surface/80",
    input:
      "w-full rounded-2xl border border-outline-variant bg-surface px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary-container",
    button:
      "w-full rounded-2xl bg-surface px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed disabled:opacity-60",
    error: "text-xs text-secondary-container",
  },
  onLight: {
    success: "rounded-2xl bg-primary-fixed/40 px-4 py-3 text-sm text-primary",
    input:
      "w-full rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary-container",
    button:
      "w-full rounded-2xl bg-primary-container px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60",
    error: "text-xs text-error",
  },
} as const;

export default function WaitlistForm({
  locale,
  labels,
  variant = "onDark",
}: {
  locale: string;
  labels: Labels;
  variant?: keyof typeof STYLES;
}) {
  const s = STYLES[variant];
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(
    reserveFoundingSeat,
    { status: "idle" },
  );

  if (state.status === "ok") {
    return (
      <div role="status" className={s.success}>
        <p className="font-semibold">{labels.success}</p>
        <p className="mt-1 opacity-80">{labels.sentHint}</p>
      </div>
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
          className={s.input}
        />
        <button type="submit" disabled={pending} className={s.button}>
          {pending ? labels.submitting : labels.button}
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className={s.error}>
          {state.code === "invalid_email"
            ? labels.invalid
            : state.code === "rate_limit"
              ? labels.rateLimit
              : labels.error}
        </p>
      )}
    </form>
  );
}
