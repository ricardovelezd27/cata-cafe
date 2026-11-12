"use client";

import { useRef, useState } from "react";
import { acceptPendingSignIn, confirmEmailToken, rejectPendingSignIn } from "@/app/actions/auth";
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
  identityExpiredTitle: string;
  identityExpiredBody: string;
  rejectedTitle: string;
  rejectedBody: string;
  toLogin: string;
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
  // A-08: set (full address) when the link verified but NO session exists yet:
  // this browser did not ask for it, so the person decides.
  const [identity, setIdentity] = useState<string | null>(null);
  const [identityFailed, setIdentityFailed] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<"card" | "expired" | "rejected">("card");
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

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    setIdentityFailed(false);
    try {
      const r = await acceptPendingSignIn(identity ?? "", locale, next);
      if (r.ok) {
        // Full navigation so the new session cookie is sent with the request.
        window.location.assign(r.data.next);
        return;
      }
      if (r.error === "conflict") {
        // The parked session is not the address shown: neutral state, no name.
        setBusy(false);
        setIdentityStatus("rejected");
        return;
      }
      if (r.error === "token_expired") {
        setBusy(false);
        setIdentityStatus("expired");
        return;
      }
    } catch {
      // fall through
    }
    setBusy(false);
    setIdentityFailed(true);
  }

  async function onNotMe() {
    if (busy) return;
    setBusy(true);
    setIdentityFailed(false);
    try {
      // Discards the parked session only; this browser's own session is untouched.
      const r = await rejectPendingSignIn();
      if (r.ok) {
        setBusy(false);
        setIdentityStatus("rejected");
        return;
      }
    } catch {
      // fall through
    }
    setBusy(false);
    setIdentityFailed(true);
  }

  if (identity && identityStatus === "rejected") {
    return (
      <div className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold text-primary">{labels.rejectedTitle}</h1>
        <p className="text-sm text-on-surface-variant">{labels.rejectedBody}</p>
        <ButtonLink href={newLinkHref} size="sm">
          {labels.toLogin}
        </ButtonLink>
      </div>
    );
  }

  if (identity && identityStatus === "expired") {
    return (
      <div role="alert" className="space-y-3">
        <h1 className="font-serif text-2xl font-semibold text-primary">{labels.identityExpiredTitle}</h1>
        <p className="text-sm text-on-surface-variant">{labels.identityExpiredBody}</p>
        <ButtonLink href={newLinkHref} size="sm">
          {labels.newLink}
        </ButtonLink>
      </div>
    );
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
          <Button type="button" onClick={onAccept} disabled={busy} aria-busy={busy}>
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
