"use client";

import { useTransition, type ReactNode } from "react";
import { signOut, switchAccount } from "@/app/actions/auth";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { useUnsyncedGuard } from "@/components/offline/UnsyncedGuardProvider";

/**
 * Sign-out / switch-account control. Before the server action clears the
 * Supabase cookie it wipes what the service worker and the offline store kept
 * on THIS device: `cata-pages-*` / `cata-rsc-*` caches (rendered, per-user
 * HTML/RSC keyed only by URL — on a shared tablet the next user could
 * otherwise be served the previous user's sessions list from cache after a
 * network blip) and the `cata_lastUser` pointer. Evaluation drafts are keyed
 * by user id and are left alone so an unsynced draft is never destroyed.
 */
export function SignOutButton({
  mode,
  locale,
  className,
  children,
}: {
  mode: "signOut" | "switchAccount";
  locale: string;
  className?: string;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const guard = useUnsyncedGuard();

  const onClick = () => {
    startTransition(async () => {
      // Drafts that exist only on this device: sync first, else warn (S8-09,
      // F-offline-5). They stay on disk either way; the cupper just knows.
      if (guard && !(await guard.confirmLeave("signOut"))) return;
      await clearLocalDeviceState();
      if (mode === "switchAccount") await switchAccount(locale);
      else await signOut();
    });
  };

  return (
    <button type="button" onClick={onClick} disabled={pending} className={className}>
      {children}
    </button>
  );
}
