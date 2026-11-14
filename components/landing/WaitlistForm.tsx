"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { reserveFoundingSeat, type WaitlistState } from "@/app/actions/waitlist";
import { EmailSentState, type EmailSentLabels } from "@/components/auth/EmailSentState";

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
  /** Sent state shared with the login form (code entry, resend, support). */
  sent: EmailSentLabels;
  supportHref: string;
};

// onDark: glass card on the green stage. onLight: the solid cream hero card.
const STYLES = {
  onDark: {
    // A plain tint, not glass: this sits INSIDE the glass founding card.
    success: "rounded-2xl bg-surface/10 px-4 py-3 text-sm text-surface/80",
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
  source = "founding",
  notice,
}: {
  locale: string;
  labels: Labels;
  variant?: keyof typeof STYLES;
  /** Which form this is (hero | founding); stored on the waitlist row. */
  source?: "hero" | "founding";
  /** Consent notice line; omitted while the legal pages are unpublished. */
  notice?: { text: string; linkLabel: string; href: string };
}) {
  const s = STYLES[variant];
  // The form is on the page twice (hero and founding card): one id each.
  const emailId = useId();
  const [state, formAction, pending] = useActionState<WaitlistState, FormData>(
    reserveFoundingSeat,
    { status: "idle" },
  );
  // "Use another email" hides the sent state until the next submit replaces `state`.
  const [dismissed, setDismissed] = useState<WaitlistState | null>(null);
  // F-landing-6: a campaign tag from ?src= is read in an effect, so the page
  // itself stays statically rendered. Re-validated on the server.
  const srcRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("src") ?? "";
      if (srcRef.current && /^[a-zA-Z0-9_-]{1,24}$/.test(raw)) srcRef.current.value = raw;
    } catch {
      /* no URL access: no tag */
    }
  }, []);

  if (state.status === "ok" && state.email && state !== dismissed) {
    const address = state.email;
    return (
      <EmailSentState
        email={address}
        locale={locale}
        labels={labels.sent}
        supportHref={labels.supportHref}
        tone={variant === "onDark" ? "dark" : "light"}
        onChangeEmail={() => setDismissed(state)}
        onResend={async () => {
          const fd = new FormData();
          fd.set("email", address);
          fd.set("locale", locale);
          fd.set("company", "");
          const r = await reserveFoundingSeat({ status: "idle" }, fd);
          if (r.status === "ok") return { ok: true };
          return {
            ok: false,
            error: r.status === "error" && r.code === "rate_limit" ? "rate_limited" : "unknown",
            retryAfterMs: r.status === "error" ? r.retryAfterMs : undefined,
          };
        }}
      />
    );
  }

  if (state.status === "ok" && !state.email) {
    return (
      <div role="status" className={s.success}>
        <p className="font-semibold">{labels.success}</p>
        <p className="mt-1 opacity-80">{labels.sentHint}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={emailId} className="sr-only">
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
      <input type="hidden" name="variant" value={source} />
      <input type="hidden" name="src" ref={srcRef} defaultValue="" />
      {/* Stacked, not inline: the card column gets narrow at lg, and an
          email input must never truncate its own placeholder. */}
      <div className="flex flex-col gap-2">
        <input
          id={emailId}
          type="email"
          name="email"
          required
          defaultValue={dismissed?.status === "ok" ? dismissed.email : undefined}
          placeholder={labels.emailPlaceholder}
          className={s.input}
        />
        <button type="submit" disabled={pending} className={s.button}>
          {pending ? labels.submitting : labels.button}
        </button>
      </div>
      {notice && (
        <p
          className={`text-xs leading-snug ${
            variant === "onDark" ? "text-surface/70" : "text-on-surface-variant"
          }`}
        >
          {notice.text}{" "}
          <Link href={notice.href} className="underline underline-offset-2">
            {notice.linkLabel}
          </Link>
        </p>
      )}
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
