"use client";

import { useRef, useState, useTransition } from "react";
import { signInWithMagicLink, signInWithGoogle } from "@/app/actions/auth";
import { rememberSignInStarted } from "@/lib/identityChange";
import type { AuthErrorKey } from "@/lib/authErrors";
import { useInAppBrowser } from "@/hooks/useInAppBrowser";
import { EmailSentState, type EmailSentLabels } from "@/components/auth/EmailSentState";
import { GoogleMark } from "@/components/auth/GoogleMark";

export function LoginForm({
  emailLabel,
  sendLabel,
  sendingLabel,
  googleLabel,
  inAppLabels,
  orLabel,
  subtitleLabel,
  sentLabels,
  errors,
  supportHref,
  locale,
  next,
  initialEmail,
  initialError,
  autoFocusEmail,
}: {
  inAppLabels: { hint: string; copy: string; copied: string };
  emailLabel: string;
  sendLabel: string;
  sendingLabel: string;
  googleLabel: string;
  orLabel: string;
  subtitleLabel: string;
  sentLabels: EmailSentLabels;
  errors: Record<AuthErrorKey, string>;
  supportHref: string;
  locale: string;
  next?: string;
  initialEmail?: string;
  initialError?: AuthErrorKey | null;
  autoFocusEmail?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<AuthErrorKey | null>(initialError ?? null);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [isPending, startTransition] = useTransition();
  const [sentEmail, setSentEmail] = useState("");
  const lastSent = useRef("");
  const inApp = useInAppBrowser();
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
    } catch {
      // Clipboard blocked in some webviews — the hint text still explains the way out.
    }
  }

  async function send(address: string) {
    const fd = new FormData();
    fd.set("email", address);
    return signInWithMagicLink(fd, next, locale);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const result = await send(email);
      if (result.ok) {
        lastSent.current = email;
        setSentEmail(email);
        setStatus("sent");
        return;
      }
      setError(result.error);
    } catch {
      // Never let the button stick on "Enviando…" if the action throws.
      setError("unknown");
    }
    setStatus("idle");
  }

  function onGoogleClick() {
    setError(null);
    rememberSignInStarted(); // WP8b: announced by the app shell once Google returns
    startTransition(async () => {
      const r = await signInWithGoogle(next, locale);
      // A success redirect throws NEXT_REDIRECT and never resolves here.
      if (r && !r.ok) setError(r.error);
    });
  }

  if (status === "sent") {
    return (
      <EmailSentState
        email={sentEmail}
        next={next}
        locale={locale}
        labels={sentLabels}
        supportHref={supportHref}
        arrival
        onResend={() => send(lastSent.current)}
        onChangeEmail={() => {
          // The typed address stays in the field.
          setStatus("idle");
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[16px]">
      {inApp ? (
        <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-3 text-body text-on-surface space-y-2">
          <p>{inAppLabels.hint}</p>
          <button
            type="button"
            onClick={copyPageLink}
            className="inline-flex min-h-[44px] items-center rounded-pill border border-primary-container px-[16px] text-caption font-semibold text-primary-container transition-colors hover:bg-primary-fixed"
          >
            {linkCopied ? inAppLabels.copied : inAppLabels.copy}
          </button>
        </div>
      ) : (
      <button
        type="button"
        onClick={onGoogleClick}
        disabled={isPending}
        className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-pill border border-outline bg-surface-container-lowest py-2.5 text-body font-semibold text-on-surface transition hover:bg-surface-container disabled:opacity-50"
      >
        <GoogleMark />
        {googleLabel}
      </button>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-outline-variant" />
        <span className="text-caption text-on-surface-variant">{orLabel}</span>
        <div className="flex-1 h-px bg-outline-variant" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-[12px]">
        <p className="text-body text-on-surface-variant">{subtitleLabel}</p>
        <label className="block">
          <span className="label-caps">
            {emailLabel}
          </span>
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            autoFocus={autoFocusEmail}
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error ? true : undefined}
            className="mt-1 min-h-[44px] w-full rounded-input border border-outline bg-surface-container-lowest px-3 py-2 text-body text-on-surface focus:border-primary-container"
          />
        </label>
        <button
          type="submit"
          disabled={status === "sending"}
          className="min-h-[44px] w-full rounded-pill bg-primary-container py-2.5 text-body font-semibold text-on-primary transition hover:bg-primary disabled:opacity-50"
        >
          {status === "sending" ? sendingLabel : sendLabel}
        </button>
        {error && (
          <p id="login-error" role="alert" className="text-error text-caption">
            {errors[error]}
          </p>
        )}
        <p className="text-caption">
          <a href={supportHref} className="inline-flex min-h-[44px] items-center font-semibold text-primary-container underline">
            {sentLabels.support}
          </a>
        </p>
      </form>
    </div>
  );
}
