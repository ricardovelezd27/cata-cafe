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
    <div className="space-y-4">
      {inApp ? (
        <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-3 text-body text-on-surface space-y-2">
          <p>{inAppLabels.hint}</p>
          <button
            type="button"
            onClick={copyPageLink}
            className="rounded-pill border border-primary-muted px-3.5 py-2 text-caption font-semibold text-primary-container hover:bg-primary-fixed-dim/25 transition-colors"
          >
            {linkCopied ? inAppLabels.copied : inAppLabels.copy}
          </button>
        </div>
      ) : (
      <button
        type="button"
        onClick={onGoogleClick}
        disabled={isPending}
        className="min-h-[44px] w-full flex items-center justify-center gap-3 py-2.5 rounded-pill border border-outline-variant bg-surface-container-lowest text-on-surface font-semibold text-caption hover:bg-surface-container transition disabled:opacity-50"
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

      <form onSubmit={onSubmit} className="space-y-3">
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
            className="min-h-[44px] mt-1 w-full px-3 py-2 border border-outline-variant rounded-input text-body bg-surface-container-lowest text-on-surface focus:border-primary-container"
          />
        </label>
        <button
          type="submit"
          disabled={status === "sending"}
          className="min-h-[44px] w-full py-2.5 rounded-pill bg-primary-container text-white font-bold hover:bg-primary-muted transition disabled:opacity-50"
        >
          {status === "sending" ? sendingLabel : sendLabel}
        </button>
        {error && (
          <p id="login-error" role="alert" className="text-error text-caption">
            {errors[error]}
          </p>
        )}
        <p className="text-caption">
          <a href={supportHref} className="font-semibold text-primary-container underline">
            {sentLabels.support}
          </a>
        </p>
      </form>
    </div>
  );
}
