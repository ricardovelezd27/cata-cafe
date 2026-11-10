"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { startGuestClaim } from "@/app/actions/guestClaim";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useUnsyncedGuard } from "@/components/offline/UnsyncedGuardProvider";
import { CLAIM_ANON_KEY } from "@/lib/offline/claimMarker";

/**
 * Step 1 of the guest → account flow from the client's side, shared by every
 * conversion surface (results banner, profile page, the "finish creating your
 * account" gate modal). Mints a claim token via `startGuestClaim` and sends
 * the guest through the NORMAL login page; `backPath` is where /auth/claim
 * returns them once the merge is confirmed (see lib/guestClaim.ts).
 */
export function useGuestClaim(locale: string) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { online } = useConnectivity();
  const guard = useUnsyncedGuard();

  const start = useCallback(
    async (backPath: string) => {
      if (starting || !online) return;
      setFailed(false);
      setStarting(true);
      try {
        // The claim deletes the anonymous account the drafts are keyed to:
        // wait for them to sync or say how many are at risk (S8-09, F-guest-5).
        if (guard && !(await guard.confirmLeave("claim"))) {
          setStarting(false);
          return;
        }
        const result = await startGuestClaim(locale, backPath);
        if (!result.ok) {
          // not_anonymous: the viewer already converted in another tab — a
          // refresh makes every guest-only surface disappear on its own.
          if (result.error === "not_anonymous") router.refresh();
          else setFailed(true);
          setStarting(false);
          return;
        }
        // confirmGuestClaim ends in a server redirect, so the client cannot
        // re-key after the merge. Remember the anonymous id; the app shell
        // re-keys the drafts on the next mount under the new account.
        if (guard) {
          try {
            window.localStorage.setItem(CLAIM_ANON_KEY, guard.userId);
          } catch {
            // private mode: the pre-claim guard above already warned
          }
        }
        router.push(result.loginUrl);
      } catch {
        setFailed(true);
        setStarting(false);
      }
    },
    [locale, online, router, starting, guard],
  );

  return { start, starting, failed, online };
}
