"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOut, switchAccount } from "@/app/actions/auth";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { stripLocale } from "@/lib/guestScope";
import { useGuestGate, type GuestLeaveTranslations } from "@/components/guest/GuestGateProvider";
import { useUnsyncedGuard } from "@/components/offline/UnsyncedGuardProvider";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button } from "@/components/ui/Button";
import { useActionFeedback } from "@/components/ui/Toast";
import { useGuestClaim } from "@/hooks/useGuestClaim";

/**
 * Sign-out / switch-account / sign-out-everywhere control (S8-07).
 *
 *  - The server goes FIRST. This device's caches (`cata-pages-*` / `cata-rsc-*`
 *    — rendered per-user HTML keyed only by URL — and the `cata_lastUser`
 *    pointer) are wiped only after the action succeeded, so an offline tap
 *    shows "Necesitas conexión" and leaves the session and the cached pages
 *    alone (F-cuenta-7). Evaluation drafts are keyed by user id and are left
 *    alone so an unsynced draft is never destroyed.
 *  - "Salir" ends THIS device only; "everywhere" is the explicit global scope
 *    behind a confirmation (F-cuenta-2).
 *  - A guest never signs out silently (F-cuenta-6, F-guest-4): the identity
 *    lives only in this browser, so a loss warning offers "Guardar mis
 *    resultados" (the normal claim flow) before "Salir de todos modos".
 *    // TODO(E1-Kim): confirm own-phone vs shared tablet; on a shared tablet
 *    // the guest may WANT to leave and let the next person start fresh.
 *    The warning for unsynced evaluation drafts is S8-09's (countDeviceOnly).
 */
export function SignOutButton({
  mode,
  locale,
  className,
  children,
}: {
  mode: "signOut" | "switchAccount" | "signOutEverywhere";
  locale: string;
  className?: string;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const feedback = useActionFeedback();
  const { isGuest, leave: t } = useGuestGate();
  const pathname = usePathname();
  const guard = useUnsyncedGuard();

  const needsConfirm = isGuest || mode === "signOutEverywhere";

  const proceed = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      feedback.notifyError("offline");
      return;
    }
    startTransition(async () => {
      // Drafts that exist only on this device: sync first, else warn (S8-09,
      // F-offline-5). They stay on disk either way; the cupper just knows.
      // Runs after the guest / everywhere confirmation and before the server.
      if (guard) {
        setConfirmOpen(false);
        if (!(await guard.confirmLeave("signOut"))) return;
      }
      const promise =
        mode === "switchAccount"
          ? switchAccount(locale)
          : signOut(locale, mode === "signOutEverywhere" ? "global" : "local");
      await feedback.run(promise, async (data) => {
        await clearLocalDeviceState();
        // A full navigation: the auth cookies changed and every cached RSC
        // payload belonged to the previous identity.
        window.location.assign(data.next);
      });
      setConfirmOpen(false);
    });
  };

  const onClick = () => {
    if (needsConfirm) setConfirmOpen(true);
    else proceed();
  };

  const backPath = `/${locale}${stripLocale(pathname)}`;
  const guestWarning = isGuest;

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending} className={className}>
        {children}
      </button>
      {needsConfirm && t && (
        <ResponsiveDialog
          open={confirmOpen}
          onOpenChange={(o) => {
            if (!pending) setConfirmOpen(o);
          }}
          title={guestWarning ? t.guestTitle : t.everywhereTitle}
          closeLabel={t.close}
        >
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-on-surface-variant">
              {guestWarning ? t.guestBody : t.everywhereBody}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {guestWarning && <SaveResultsButton locale={locale} backPath={backPath} disabled={pending} t={t} />}
              <Button
                variant={guestWarning ? "danger" : "primary"}
                onClick={proceed}
                disabled={pending}
                aria-busy={pending}
              >
                {guestWarning ? t.leaveAnyway : t.everywhereConfirm}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>
                {t.cancel}
              </Button>
            </div>
          </div>
        </ResponsiveDialog>
      )}
    </>
  );
}

/** Own component so the connectivity probe behind useGuestClaim only runs
 *  while the guest warning is actually open. */
function SaveResultsButton({
  locale,
  backPath,
  disabled,
  t,
}: {
  locale: string;
  backPath: string;
  disabled: boolean;
  t: GuestLeaveTranslations;
}) {
  const claim = useGuestClaim(locale);
  return (
    <>
      <Button onClick={() => claim.start(backPath)} disabled={disabled || claim.starting || !claim.online}>
        {claim.starting ? t.saving : t.save}
      </Button>
      {!claim.online && <p className="text-xs text-on-surface-variant">{t.offline}</p>}
      {claim.failed && (
        <p role="alert" className="text-xs text-error">
          {t.saveError}
        </p>
      )}
    </>
  );
}
