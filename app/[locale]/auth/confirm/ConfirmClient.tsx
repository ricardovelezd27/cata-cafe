"use client";

import { useRef, useState } from "react";
import { confirmEmailToken } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/ui";

type Labels = {
  title: string;
  body: string;
  button: string;
  working: string;
  failedTitle: string;
  failedBody: string;
  newLink: string;
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function onConfirm() {
    if (busy || !tokenHash || !type) return;
    setBusy(true);
    try {
      const r = await confirmEmailToken(tokenHash, type, next, locale);
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
