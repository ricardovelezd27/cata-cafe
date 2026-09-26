"use client";

import { UserRoundPlus } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { useGuestClaim } from "@/hooks/useGuestClaim";

export type GuestClaimButtonTranslations = {
  label: string;
  loading: string;
  offline: string;
  error: string;
};

/**
 * "Terminar de crear tu cuenta" — direct entry into the guest → account claim
 * flow (no modal), used on the guest's own profile page. Same states as the
 * results banner: disabled offline, loading label while the token is minted,
 * inline error on failure.
 */
export function GuestClaimButton({
  locale,
  backPath,
  translations: t,
  variant = "primary",
  size = "sm",
  className = "",
}: {
  locale: string;
  backPath: string;
  translations: GuestClaimButtonTranslations;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const claim = useGuestClaim(locale);
  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        icon={<UserRoundPlus size={16} aria-hidden />}
        onClick={() => claim.start(backPath)}
        disabled={claim.starting || !claim.online}
      >
        {claim.starting ? t.loading : t.label}
      </Button>
      {!claim.online && <p className="mt-2 text-xs text-on-surface-variant">{t.offline}</p>}
      {claim.failed && (
        <p role="alert" className="mt-2 text-xs text-error">
          {t.error}
        </p>
      )}
    </div>
  );
}
