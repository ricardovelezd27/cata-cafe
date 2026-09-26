"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { startGuestClaim } from "@/app/actions/guestClaim";
import { useConnectivity } from "@/hooks/useConnectivity";

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

  const start = useCallback(
    async (backPath: string) => {
      if (starting || !online) return;
      setFailed(false);
      setStarting(true);
      try {
        const result = await startGuestClaim(locale, backPath);
        if (!result.ok) {
          // not_anonymous: the viewer already converted in another tab — a
          // refresh makes every guest-only surface disappear on its own.
          if (result.error === "not_anonymous") router.refresh();
          else setFailed(true);
          setStarting(false);
          return;
        }
        router.push(result.loginUrl);
      } catch {
        setFailed(true);
        setStarting(false);
      }
    },
    [locale, online, router, starting],
  );

  return { start, starting, failed, online };
}
