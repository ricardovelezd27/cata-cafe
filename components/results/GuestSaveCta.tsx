"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { UserRoundPlus, X } from "lucide-react";
import { startGuestClaim } from "@/app/actions/guestClaim";
import { useConnectivity } from "@/hooks/useConnectivity";
import { Button } from "@/components/ui";

const DISMISS_EVENT = "cata-guest-cta-dismiss";

// Dismissal lives in sessionStorage — "Ahora no" means exactly that: quiet for
// the rest of this visit, back on the next one (this banner is the app's only
// guest→account conversion surface, so a permanent dismissal would orphan the
// guest's data forever). Read via an external store (same pattern as
// ResultsClient's Tabla/Gráfico persistence) so we avoid setState-in-effect
// and hydration mismatches: the server snapshot reports "dismissed", so the
// banner only appears after hydration confirms it was never dismissed.
function subscribeDismissed(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(DISMISS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(DISMISS_EVENT, cb);
  };
}

export type GuestSaveCtaTranslations = {
  title: string;
  body: string;
  cta: string;
  ctaLoading: string;
  dismiss: string;
  offline: string;
  error: string;
};

/**
 * "Guarda tus resultados" — the guest→account conversion entry point. It does
 * NOT run its own auth: it mints a claim token for the anonymous guest
 * (startGuestClaim) and sends them through the NORMAL login page (magic link
 * + Google, the same flow every account is created with). After sign-in,
 * /auth/claim moves the guest's tasting data onto the signed-in account —
 * new or existing — and returns here (see lib/guestClaim.ts).
 *
 * Valor antes que fricción: the banner is dismissible (quiet for the rest of
 * the visit, back on the next one) and never blocks the results underneath it.
 */
export function GuestSaveCta({
  sessionId,
  locale,
  translations: t,
}: {
  sessionId: string;
  locale: string;
  translations: GuestSaveCtaTranslations;
}) {
  const router = useRouter();
  const dismissKey = `cata_guest_cta_dismissed_${sessionId}`;

  const storedDismissed = useSyncExternalStore(
    subscribeDismissed,
    () => {
      try {
        return sessionStorage.getItem(dismissKey) === "1";
      } catch {
        return false;
      }
    },
    // Server snapshot: hidden — the banner appears only after hydration.
    () => true,
  );
  // Fallback when sessionStorage is unavailable (the event still fires but the
  // snapshot can't change): hide for this page view at least.
  const [locallyDismissed, setLocallyDismissed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { online } = useConnectivity();

  if (storedDismissed || locallyDismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      // Best effort — the local flag below still hides it.
    }
    setLocallyDismissed(true);
    window.dispatchEvent(new Event(DISMISS_EVENT));
  };

  const handleStart = async () => {
    if (starting || !online) return;
    setFailed(false);
    setStarting(true);
    try {
      const result = await startGuestClaim(locale, `/${locale}/app/sessions/${sessionId}/results`);
      if (!result.ok) {
        // not_anonymous: the viewer already converted in another tab — a
        // refresh makes the banner disappear on its own.
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
  };

  return (
    <section
      aria-label={t.title}
      className="relative mx-4 mt-4 rounded-card border border-secondary/30 bg-secondary-container/20 p-4 pr-10 lg:mx-6"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t.dismiss}
        title={t.dismiss}
        className="absolute right-2 top-2 rounded-pill p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <X size={16} aria-hidden />
      </button>

      <div className="flex items-start gap-3">
        <UserRoundPlus size={18} aria-hidden className="mt-0.5 shrink-0 text-secondary" />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-semibold text-on-surface">{t.title}</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">{t.body}</p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button size="sm" onClick={handleStart} disabled={starting || !online}>
              {starting ? t.ctaLoading : t.cta}
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs font-medium text-on-surface-variant underline underline-offset-2 hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 sm:ml-1"
            >
              {t.dismiss}
            </button>
          </div>

          {!online && <p className="mt-2 text-xs text-on-surface-variant">{t.offline}</p>}
          {failed && (
            <p role="alert" className="mt-2 text-xs text-error">
              {t.error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
