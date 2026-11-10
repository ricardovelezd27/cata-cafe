"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { verifyEmailCode } from "@/app/actions/auth";
import { authErrorFromAction, type AuthErrorKey } from "@/lib/authErrors";

// The "we sent you something" state shared by the login form and the
// founding-seat form (S8-06, F-entrar-1, F-landing-4). It shows WHERE the mail
// went, offers the 6-digit code from the same email (works when a scanner ate
// the link or it opened in the wrong browser), a 60 s resend countdown and a
// way back to change the address (the value is kept by the parent).
// Copy arrives as props (client components do not call useTranslations()).

export type EmailSentLabels = {
  title: string;
  /** Raw template with `{email}`. */
  body: string;
  codeLabel: string;
  codeHint: string;
  codeSubmit: string;
  codeSubmitting: string;
  resend: string;
  /** Raw template with `{seconds}`. */
  resendIn: string;
  resent: string;
  changeEmail: string;
  support: string;
  errors: Record<AuthErrorKey, string>;
};

export type ResendResult = { ok: true } | { ok: false; error: AuthErrorKey; retryAfterMs?: number };

const COOLDOWN_MS = 60_000;

const TONES = {
  light: {
    text: "text-on-surface",
    muted: "text-on-surface-variant",
    input:
      "w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-center text-lg tracking-[0.4em] text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container",
    primary:
      "rounded-pill bg-primary-container px-5 min-h-[44px] text-sm font-medium text-on-primary hover:bg-primary disabled:opacity-60",
    link: "text-xs font-semibold text-primary underline disabled:no-underline disabled:opacity-60",
    error: "text-sm text-error",
  },
  dark: {
    text: "text-surface",
    muted: "text-surface/70",
    input:
      "w-full rounded-input border border-outline-variant bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container",
    primary:
      "rounded-pill bg-surface px-5 min-h-[44px] text-sm font-semibold text-primary hover:bg-primary-fixed disabled:opacity-60",
    link: "text-xs font-semibold text-surface underline disabled:no-underline disabled:opacity-60",
    error: "text-sm text-secondary-container",
  },
} as const;

export function EmailSentState({
  email,
  next,
  locale,
  labels,
  supportHref,
  onResend,
  onChangeEmail,
  initialCooldownMs = COOLDOWN_MS,
  tone = "light",
}: {
  email: string;
  next?: string;
  locale: string;
  labels: EmailSentLabels;
  supportHref: string;
  onResend: () => Promise<ResendResult>;
  onChangeEmail: () => void;
  initialCooldownMs?: number;
  tone?: keyof typeof TONES;
}) {
  const s = TONES[tone];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [resentNotice, setResentNotice] = useState(false);
  const [readyAt, setReadyAt] = useState(() => Date.now() + initialCooldownMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (now >= readyAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [now, readyAt]);

  const secondsLeft = Math.max(0, Math.ceil((readyAt - now) / 1000));

  const submitCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (verifying || !/^\d{6}$/.test(code)) return;
      setVerifying(true);
      setError(null);
      try {
        const r = await verifyEmailCode(email, code, next, locale);
        if (r.ok) {
          window.location.assign(r.data.next);
          return; // stay in the verifying state while the page navigates
        }
        setError(authErrorFromAction(r.error));
      } catch {
        setError("unknown");
      }
      setVerifying(false);
    },
    [code, email, locale, next, verifying],
  );

  async function resend() {
    if (resending || secondsLeft > 0) return;
    setResending(true);
    setError(null);
    setResentNotice(false);
    try {
      const r = await onResend();
      if (r.ok) {
        setResentNotice(true);
        setReadyAt(Date.now() + COOLDOWN_MS);
      } else {
        setError(r.error);
        if (r.retryAfterMs) setReadyAt(Date.now() + r.retryAfterMs);
      }
    } catch {
      setError("unknown");
    }
    setNow(Date.now());
    setResending(false);
  }

  const errorId = "email-sent-error";

  return (
    <div className={`space-y-4 ${s.text}`}>
      <div role="status" className="space-y-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
          {labels.title}
        </h2>
        <p className={`text-sm ${s.muted}`}>{labels.body.replace("{email}", email)}</p>
        {resentNotice && <p className={`text-xs ${s.muted}`}>{labels.resent}</p>}
      </div>

      <form onSubmit={submitCode} className="space-y-2">
        <label className="block">
          <span className={`text-xs font-semibold uppercase tracking-wide ${s.muted}`}>
            {labels.codeLabel}
          </span>
          <input
            type="text"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className={`mt-1 ${s.input}`}
          />
        </label>
        <p className={`text-xs ${s.muted}`}>{labels.codeHint}</p>
        <button type="submit" disabled={verifying || code.length !== 6} className={s.primary}>
          {verifying ? labels.codeSubmitting : labels.codeSubmit}
        </button>
        {error && (
          <p id={errorId} role="alert" className={s.error}>
            {labels.errors[error]}
          </p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={resend} disabled={resending || secondsLeft > 0} className={s.link}>
          {secondsLeft > 0 ? labels.resendIn.replace("{seconds}", String(secondsLeft)) : labels.resend}
        </button>
        <button type="button" onClick={onChangeEmail} className={s.link}>
          {labels.changeEmail}
        </button>
        <a href={supportHref} className={s.link}>
          {labels.support}
        </a>
      </div>
    </div>
  );
}
