"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Submit button for the guest-claim confirmation form. Disabled while the
 * server action runs so a double-tap can't queue a second confirmGuestClaim
 * — the queued repeat would find the guest already merged and bounce the
 * user from their freshly linked results onto the "already linked" card.
 */
export function ClaimConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
