"use client";

import { useRef, useState } from "react";
import { announceSignedIn } from "@/lib/identityChange";
import { acceptPendingSignIn, confirmEmailToken, rejectPendingSignIn } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/ui";
import { ArrivalCard } from "@/components/arrival/ArrivalCard";

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
        announceSignedIn(); // WP8b: tabs paused by a sign-out may resume
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
        announceSignedIn(); // WP8b
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
      <ArrivalCard
        tone="info"
        title={labels.rejectedTitle}
        lead={labels.rejectedBody}
        actions={
          <ButtonLink href={newLinkHref} className="w-full">
            {labels.toLogin}
          </ButtonLink>
        }
      />
    );
  }

  if (identity && identityStatus === "expired") {
    return (
      <ArrivalCard
        role="alert"
        tone="warning"
        title={labels.identityExpiredTitle}
        lead={labels.identityExpiredBody}
        actions={
          <ButtonLink href={newLinkHref} className="w-full">
            {labels.newLink}
          </ButtonLink>
        }
      />
    );
  }

  if (identity) {
    return (
      <ArrivalCard
        title={labels.identityTitle}
        // The full address, on its own line so it can be read whole and never cut.
        lead={<p className="break-words">{labels.identityBody.replace("{email}", identity)}</p>}
        actions={
          <>
            <Button type="button" className="w-full" onClick={onAccept} disabled={busy} aria-busy={busy}>
              {labels.identityYes}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={onNotMe} disabled={busy} aria-busy={busy}>
              {labels.identityNo}
            </Button>
          </>
        }
      >
        {identityFailed && (
          <p role="alert" className="text-caption text-error">
            {labels.identityError}
          </p>
        )}
      </ArrivalCard>
    );
  }

  if (failed) {
    return (
      <ArrivalCard
        role="alert"
        tone="warning"
        title={labels.failedTitle}
        titleRef={headingRef}
        titleFocusable
        lead={labels.failedBody}
        actions={
          <ButtonLink href={newLinkHref} className="w-full">
            {labels.newLink}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ArrivalCard
      title={labels.title}
      lead={labels.body}
      actions={
        <Button type="button" className="w-full" onClick={onConfirm} disabled={busy} aria-busy={busy}>
          {busy ? labels.working : labels.button}
        </Button>
      }
    />
  );
}
