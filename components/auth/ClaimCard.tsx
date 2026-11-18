"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmGuestClaim } from "@/app/actions/guestClaim";
import { switchAccount } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/ui";
import { ArrivalCard } from "@/components/arrival/ArrivalCard";
import { useActionFeedback } from "@/components/ui/Toast";
import { useConnectivity } from "@/hooks/useConnectivity";
import { announceSignedIn } from "@/lib/identityChange";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { CLAIM_DONE_KEY, serializeDone } from "@/lib/offline/claimMarker";
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
  anonId,
  accountId,
  strings: t,
}: {
  locale: "es" | "en";
  token: string;
  back: string;
  home: string;
  /** This page's own URL (token + back): where "Usar otra cuenta" returns to. */
  claimUrl: string;
  /** The guest id the claim token names (S8-09 claim completion marker). */
  anonId: string;
  /** The signed-in account that is confirming the merge. */
  accountId: string;
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
          // S8-09: record who completed which claim so UnsyncedGuardProvider
          // re-keys the guest's offline drafts to THIS account and no other
          // (lib/offline/claimMarker.ts). Written only once the merge succeeded.
          try {
            window.localStorage.setItem(CLAIM_DONE_KEY, serializeDone(anonId, accountId));
          } catch {
            // private mode: the drafts stay under the guest id on this device
          }
          announceSignedIn(); // WP8b: an old cup tab for the guest re-keys and reloads
          router.replace(result.data.next);
          router.refresh();
          return;
        }
        const code: ActionErrorCode = result.error;
        if (code === "invalid_token") router.replace(errorPage("invalid"));
        else if (code === "token_expired") router.replace(errorPage("expired"));
        else if (code === "already_claimed") router.replace(errorPage("already"));
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
        // C-08: the claim is still in progress under the other account, so the
        // anonymous-id marker must survive for the re-key after confirmation.
        await clearLocalDeviceState({ keepClaimInProgress: true });
        window.location.assign(data.next);
      });
    });
  }

  if (phase === "retry") {
    return (
      <ArrivalCard
        tone="error"
        title={t.retryTitle}
        lead={<p role="alert">{t.retryBody}</p>}
        actions={
          <>
            <Button className="w-full" onClick={confirm} disabled={pending}>
              {pending ? t.confirming : t.retry}
            </Button>
            <ButtonLink href={home} variant="secondary" className="w-full">
              {t.skipBack}
            </ButtonLink>
          </>
        }
      />
    );
  }

  if (phase === "skip") {
    return (
      <ArrivalCard
        tone="warning"
        title={t.skipTitle}
        lead={t.skipBody}
        actions={
          <>
            {/* the safe way first: going back keeps the choice open */}
            <Button variant="secondary" className="w-full" onClick={() => setPhase("idle")}>
              {t.skipBack}
            </Button>
            <ButtonLink href={home} variant="danger" className="w-full">
              {t.skipConfirm}
            </ButtonLink>
          </>
        }
      />
    );
  }

  return (
    <ArrivalCard
      title={t.title}
      lead={
        <>
          <p className="break-words text-on-surface">{t.body}</p>
          <p className="text-caption">{t.note}</p>
          {!online && <p className="text-caption">{t.offline}</p>}
        </>
      }
      actions={
        <>
          {/* the next step first; the two other ways out under it, quieter */}
          <Button className="w-full" onClick={confirm} disabled={pending || !online} aria-busy={pending}>
            {pending ? t.confirming : t.confirm}
          </Button>
          <Button variant="secondary" className="w-full" onClick={switchToOther} disabled={pending}>
            {t.useOther}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setPhase("skip")} disabled={pending}>
            {t.skip}
          </Button>
        </>
      }
    />
  );
}
