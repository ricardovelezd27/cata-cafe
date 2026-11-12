"use client";

import { useRef, useState } from "react";
import { confirmEmailToken, switchAccount } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/ui";

type Labels = {
  title: string;
  body: string;
  button: string;
  working: string;
  failedTitle: string;
  failedBody: string;
  newLink: string;
  /** Contains the literal "{email}" placeholder (replaced here, never via t()). */
  identityBody: string;
  identityTitle: string;
  identityYes: string;
  identityNo: string;
  identityError: string;
};

/** The "Entrar" button: the ONLY thing that consumes the email token. */
export function ConfirmClient({
  tokenHash,
  type,
  next,
  locale,
  newLinkHref,
  labels,
}: {
  tokenHash?: string;
  type?: string;
  next: string;
  locale: string;
  newLinkHref: string;
  labels: Labels;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(!tokenHash || !type);
  // A-08: set when the session exists but this browser did not ask for it.
  const [identity, setIdentity] = useState<string | null>(null);
  const [identityFailed, setIdentityFailed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function onConfirm() {
    if (busy || !tokenHash || !type) return;
    setBusy(true);
    try {
      const r = await confirmEmailToken(tokenHash, type, next, locale);
      if (r.ok && r.data.confirmIdentity) {
        setIdentity(r.data.confirmIdentity);
        setBusy(false);
        return;
      }
      if (r.ok) {
        // Full navigation so the new session cookie is sent with the request.
        window.location.assign(r.data.next);
        return;
      }
    } catch {
      // fall through to the failure state
    }
    setBusy(false);
    setFailed(true);
    queueMicrotask(() => headingRef.current?.focus());
  }

  async function onNotMe() {
    if (busy) return;
    setBusy(true);
    setIdentityFailed(false);
    try {
      // Ends the session that verifyOtp just created (local scope), then login.
      const r = await switchAccount(locale, next);
      if (r.ok) {
        window.location.assign(r.data.next);
        return;
      }
    } catch {
      // fall through
    }
    setBusy(false);
    setIdentityFailed(true);
  }

  if (identity) {
    return (
      <div className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold text-primary">{labels.identityTitle}</h1>
        <p className="text-sm text-on-surface-variant">{labels.identityBody.replace("{email}", identity)}</p>
        {identityFailed && (
          <p role="alert" className="text-sm text-error">
            {labels.identityError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => window.location.assign(next)} disabled={busy}>
            {labels.identityYes}
          </Button>
          <Button type="button" variant="secondary" onClick={onNotMe} disabled={busy} aria-busy={busy}>
            {labels.identityNo}
          </Button>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div role="alert" className="space-y-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold text-primary outline-none">
          {labels.failedTitle}
        </h1>
        <p className="text-sm text-on-surface-variant">{labels.failedBody}</p>
        <ButtonLink href={newLinkHref} size="sm">
          {labels.newLink}
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="font-serif text-2xl font-semibold text-primary">{labels.title}</h1>
      <p className="text-sm text-on-surface-variant">{labels.body}</p>
      <Button type="button" onClick={onConfirm} disabled={busy} aria-busy={busy}>
        {busy ? labels.working : labels.button}
      </Button>
    </div>
  );
}
