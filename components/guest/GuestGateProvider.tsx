"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserRoundPlus } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button } from "@/components/ui/Button";
import { useGuestClaim } from "@/hooks/useGuestClaim";
import { GUEST_GATE_PARAM, stripLocale } from "@/lib/guestScope";

export type GuestGateTranslations = {
  title: string;
  body: string;
  cta: string;
  ctaLoading: string;
  dismiss: string;
  close: string;
  offline: string;
  error: string;
};

type GuestGateContextValue = {
  isGuest: boolean;
  /** Opens the "finish creating your account" modal. `backPath` is where the
   *  claim flow returns the (now registered) user — normally the gated
   *  destination they tried to open. No-op for registered users. */
  openGate: (backPath?: string) => void;
};

const GuestGateContext = createContext<GuestGateContextValue>({
  isGuest: false,
  openGate: () => {},
});

export function useGuestGate(): GuestGateContextValue {
  return useContext(GuestGateContext);
}

/** Opens the gate once when the proxy bounced a guest here with ?gate=1, then
 *  strips the param so a reload / back-navigation doesn't reopen it. Lives in
 *  its own component because useSearchParams needs a Suspense boundary. */
function GateFromQuery({ onGate }: { onGate: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const gated = params.get(GUEST_GATE_PARAM) === "1";

  useEffect(() => {
    if (!gated) return;
    onGate();
    const next = new URLSearchParams(params.toString());
    next.delete(GUEST_GATE_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [gated, onGate, params, pathname, router]);

  return null;
}

/**
 * App-shell provider for the guest (anonymous QR walk-up) experience. Every
 * user sees the same navigation; for a guest, a gated destination opens this
 * modal instead of navigating (see GuestGateLink), and the proxy's ?gate=1
 * redirect opens it too. The CTA reuses the normal guest → account claim flow.
 */
export function GuestGateProvider({
  isGuest,
  locale,
  translations: t,
  children,
}: {
  isGuest: boolean;
  locale: string;
  translations: GuestGateTranslations;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [backPath, setBackPath] = useState<string | null>(null);
  const pathname = usePathname();
  const claim = useGuestClaim(locale);

  const openGate = useCallback(
    (back?: string) => {
      if (!isGuest) return;
      setBackPath(back ?? null);
      setOpen(true);
    },
    [isGuest],
  );
  const openFromQuery = useCallback(() => openGate(), [openGate]);

  const value = useMemo(() => ({ isGuest, openGate }), [isGuest, openGate]);

  // safeClaimBack() only accepts `/${locale}/app/...`; with localePrefix
  // "as-needed" the Spanish pathname may arrive unprefixed, so normalize.
  const resolvedBack = backPath ?? `/${locale}${stripLocale(pathname)}`;

  return (
    <GuestGateContext.Provider value={value}>
      {children}
      {isGuest && (
        <>
          <Suspense fallback={null}>
            <GateFromQuery onGate={openFromQuery} />
          </Suspense>
          <ResponsiveDialog open={open} onOpenChange={setOpen} title={t.title} closeLabel={t.close}>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <UserRoundPlus size={20} aria-hidden className="mt-0.5 shrink-0 text-secondary" />
                <p className="text-sm leading-relaxed text-on-surface-variant">{t.body}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  onClick={() => claim.start(resolvedBack)}
                  disabled={claim.starting || !claim.online}
                >
                  {claim.starting ? t.ctaLoading : t.cta}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  {t.dismiss}
                </Button>
              </div>
              {!claim.online && <p className="text-xs text-on-surface-variant">{t.offline}</p>}
              {claim.failed && (
                <p role="alert" className="text-xs text-error">
                  {t.error}
                </p>
              )}
            </div>
          </ResponsiveDialog>
        </>
      )}
    </GuestGateContext.Provider>
  );
}
