"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmGuestClaim } from "@/app/actions/guestClaim";
import { switchAccount } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/ui";
import { useActionFeedback } from "@/components/ui/Toast";
import { useConnectivity } from "@/hooks/useConnectivity";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import type { ActionErrorCode } from "@/lib/actionResult";

export type ClaimCardStrings = {
  title: string;
  body: string;
  note: string;
  confirm: string;
  confirming: string;
  useOther: string;
  skip: string;
  skipTitle: string;
  skipBody: string;
  skipConfirm: string;
  skipBack: string;
  retryTitle: string;
  retryBody: string;
  retry: string;
  offline: string;
};

/**
 * The guest-claim confirmation card (S8-07, F-guest-4, F-guest-8). Three exits
 * instead of the old "Cancelar": link (primary), "Usar otra cuenta" (sign out
 * of THIS account and come back to the same claim with another one), and "No
 * vincular" (behind a warning, because the guest's results then stay on the
 * guest identity only). A transient failure shows a retry card; final states
 * (bad / expired / already linked) go back to the page's own error cards.
 */
export function ClaimCard({
  locale,
  token,
  back,
  home,
  claimUrl,
  strings: t,
}: {
  locale: "es" | "en";
  token: string;
  back: string;
  home: string;
  /** This page's own URL (token + back): where "Usar otra cuenta" returns to. */
  claimUrl: string;
  strings: ClaimCardStrings;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const { online } = useConnectivity();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "retry" | "skip">("idle");

  const errorPage = (error: string) =>
    `${claimUrl.split("&error=")[0]}&error=${error}`;

  function confirm() {
    if (!online) {
      feedback.notifyError("offline");
      return;
    }
    startTransition(async () => {
      try {
        const result = await confirmGuestClaim(locale, token, back);
        if (result.ok) {
          router.replace(result.data.next);
          router.refresh();
          return;
        }
        const code: ActionErrorCode = result.error;
        if (code === "invalid_token") router.replace(errorPage("invalid"));
        else if (code === "token_expired") router.replace(errorPage("expired"));
        else if (code === "not_found") router.replace(errorPage("already"));
        else if (code === "not_authenticated") router.replace(`/${locale}/auth/login?next=${encodeURIComponent(claimUrl)}&intent=claim`);
        else setPhase("retry");
      } catch {
        setPhase("retry");
      }
    });
  }

  function switchToOther() {
    if (!online) {
      feedback.notifyError("offline");
      return;
    }
    startTransition(async () => {
      await feedback.run(switchAccount(locale, claimUrl), async (data) => {
        await clearLocalDeviceState();
        window.location.assign(data.next);
      });
    });
  }

  if (phase === "retry") {
    return (
      <>
        <h1 className="font-display text-2xl text-primary-container">{t.retryTitle}</h1>
        <p role="alert" className="text-sm text-on-surface-variant">
          {t.retryBody}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <ButtonLink href={home} variant="secondary" size="sm">
            {t.skipBack}
          </ButtonLink>
          <Button size="sm" onClick={confirm} disabled={pending}>
            {pending ? t.confirming : t.retry}
          </Button>
        </div>
      </>
    );
  }

  if (phase === "skip") {
    return (
      <>
        <h1 className="font-display text-2xl text-primary-container">{t.skipTitle}</h1>
        <p className="text-sm text-on-surface">{t.skipBody}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" size="sm" onClick={() => setPhase("idle")}>
            {t.skipBack}
          </Button>
          <ButtonLink href={home} variant="danger" size="sm">
            {t.skipConfirm}
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl text-primary-container">{t.title}</h1>
      <p className="text-sm text-on-surface">{t.body}</p>
      <p className="text-xs text-on-surface-variant">{t.note}</p>
      {!online && <p className="text-xs text-on-surface-variant">{t.offline}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="ghost" size="sm" onClick={() => setPhase("skip")} disabled={pending}>
          {t.skip}
        </Button>
        <Button variant="secondary" size="sm" onClick={switchToOther} disabled={pending}>
          {t.useOther}
        </Button>
        <Button size="sm" onClick={confirm} disabled={pending || !online} aria-busy={pending}>
          {pending ? t.confirming : t.confirm}
        </Button>
      </div>
    </>
  );
}
