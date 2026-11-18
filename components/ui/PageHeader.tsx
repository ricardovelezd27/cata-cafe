"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** The back link every detail and create page opens with (D-06). PageHeader renders it;
 *  a page whose title is not a PageHeader (an editable name) uses it on its own. */
export function PageBackLink({ href, label }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="-my-[6px] inline-flex min-h-[44px] w-fit items-center gap-1 text-caption text-on-surface-variant transition-colors hover:text-on-surface"
    >
      <ChevronLeft size={16} aria-hidden />
      {label}
    </Link>
  );
}

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
      {backHref && <PageBackLink href={backHref} label={backLabel} />}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title text-page">{title}</h1>
          {description && <p className="mt-1 text-caption text-on-surface-variant">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
