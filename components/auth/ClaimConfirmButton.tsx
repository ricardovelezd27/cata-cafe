"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { CLAIM_DONE_KEY, serializeDone } from "@/lib/offline/claimMarker";

/**
 * Submit button for the guest-claim confirmation form. Disabled while the
 * server action runs so a double-tap can't queue a second confirmGuestClaim
 * — the queued repeat would find the guest already merged and bounce the
 * user from their freshly linked results onto the "already linked" card.
 */
export function ClaimConfirmButton({
  label,
  pendingLabel,
  anonId,
  accountId,
}: {
  label: string;
  pendingLabel: string;
  /** The guest id the claim token names. */
  anonId: string;
  /** The signed-in account that is confirming the merge. */
  accountId: string;
}) {
  const { pending } = useFormStatus();
  // confirmGuestClaim ends in a server redirect, so the client never sees the
  // result. Recording who confirmed what is what lets UnsyncedGuardProvider
  // re-key the guest's offline drafts to THIS account and to no other
  // (lib/offline/claimMarker.ts).
  const markConfirmed = () => {
    try {
      window.localStorage.setItem(CLAIM_DONE_KEY, serializeDone(anonId, accountId));
    } catch {
      // private mode: the drafts stay under the guest id on this device
    }
  };
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending} onClick={markConfirmed}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
