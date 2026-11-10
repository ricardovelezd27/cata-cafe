"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { useBrowserOnline } from "@/hooks/useBrowserOnline";
import { useIsNativeShell } from "@/hooks/useIsNativeShell";
import { openReport } from "@/lib/platform/openReport";

interface ReportLinkProps {
  href: string;
  /** Filename used when the shell saves / shares the report. */
  filename: string;
  /** Shown (title + aria) when the device is offline and the button is disabled. */
  offlineLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  /** Web only: open in a new tab (inline PDF viewer). */
  newTab?: boolean;
  children: ReactNode;
}

/**
 * Report (PDF) link behind the platform seam. On the web it IS the plain
 * anchor (target/rel as the caller asks) — the click path is untouched. Inside
 * a native shell it intercepts and goes through `openReport` (authenticated
 * fetch, then share/save). Offline it is disabled with a "needs a connection"
 * hint instead of hitting a browser error page. (S8-15, F-informes-4 / F-resultados-9)
 */
export function ReportLink({
  href,
  filename,
  offlineLabel,
  variant,
  size,
  icon,
  className,
  newTab,
  children,
}: ReportLinkProps) {
  const online = useBrowserOnline();
  const inShell = useIsNativeShell();

  if (!online) {
    return (
      <Button
        variant={variant}
        size={size}
        icon={icon}
        className={className}
        disabled
        title={offlineLabel}
        aria-label={`${typeof children === "string" ? children : filename} — ${offlineLabel}`}
      >
        {children}
      </Button>
    );
  }

  return (
    <ButtonLink
      href={href}
      variant={variant}
      size={size}
      icon={icon}
      className={className}
      {...(newTab && !inShell ? { target: "_blank", rel: "noopener" } : {})}
      onClick={
        inShell
          ? (e) => {
              e.preventDefault();
              void openReport(href, filename, { online });
            }
          : undefined
      }
    >
      {children}
    </ButtonLink>
  );
}
