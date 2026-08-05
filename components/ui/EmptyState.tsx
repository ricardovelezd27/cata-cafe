"use client";

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-16 text-center">
      {icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-container text-on-surface-variant">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl text-on-surface">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-on-surface-variant">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
