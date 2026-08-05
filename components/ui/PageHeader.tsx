"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <ChevronLeft size={16} aria-hidden />
          {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-primary-container leading-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
