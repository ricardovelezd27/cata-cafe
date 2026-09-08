"use client";

import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";

/**
 * The one error surface every route boundary renders (app/global-error.tsx,
 * app/[locale]/error.tsx, app/[locale]/app/error.tsx, the not-found pages and
 * the cupping boundary's non-network branch). Copy comes in as props so the
 * same panel works with next-intl (inside [locale]) and with a hardcoded map
 * (global-error, offline cold loads) alike.
 *
 * `homeHref` is a plain anchor on purpose: when the router itself is what
 * broke, a full navigation is the only thing guaranteed to work.
 */
export type ErrorPanelProps = {
  title: string;
  body: string;
  retryLabel?: string;
  onRetry?: () => void;
  homeLabel: string;
  homeHref: string;
  /** e.g. "Código de soporte" — shown only together with `digest`. */
  supportLabel?: string;
  /** `error.digest` from the boundary props; lets a user quote it to support. */
  digest?: string;
};

export function ErrorPanel({
  title,
  body,
  retryLabel,
  onRetry,
  homeLabel,
  homeHref,
  supportLabel,
  digest,
}: ErrorPanelProps) {
  return (
    <div role="alert" className="mx-auto w-full max-w-md py-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-error-container text-error">
        <AlertTriangle size={22} aria-hidden />
      </div>
      <h1 className="font-display text-2xl text-on-surface">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-on-surface-variant">{body}</p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {retryLabel && onRetry && (
          <Button variant="primary" onClick={onRetry} icon={<RotateCw size={16} aria-hidden />}>
            {retryLabel}
          </Button>
        )}
        <ButtonLink href={homeHref} variant="secondary" icon={<Home size={16} aria-hidden />}>
          {homeLabel}
        </ButtonLink>
      </div>

      {digest && (
        <p className="mt-6 text-xs text-on-surface-variant">
          {supportLabel ? `${supportLabel}: ` : ""}
          <code className="rounded-input bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
            {digest}
          </code>
        </p>
      )}
    </div>
  );
}

export default ErrorPanel;
