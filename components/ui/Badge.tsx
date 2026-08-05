"use client";

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "accent" | "danger" | "outline";
export type BadgeSize = "xs" | "sm";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  success: "bg-primary-fixed text-primary-container",
  accent: "bg-secondary-fixed text-secondary",
  danger: "bg-error-container text-on-error-container",
  outline: "bg-transparent border border-outline-variant text-on-surface-variant",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-xs px-2 py-0.5",
};

export function Badge({
  children,
  tone = "neutral",
  size = "sm",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill font-semibold whitespace-nowrap ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
    >
      {children}
    </span>
  );
}

export type SessionStatus = "draft" | "active" | "open" | "closed";

/** "open" is a legacy status value from older rows — treated as "active". */
function normalizeStatus(status: string): "draft" | "active" | "closed" | null {
  if (status === "open") return "active";
  if (status === "draft" || status === "active" || status === "closed") return status;
  return null;
}

export function StatusPill({
  status,
  labels,
}: {
  status: string;
  labels: { draft: string; active: string; closed: string };
}) {
  const normalized = normalizeStatus(status);
  const tone: BadgeTone =
    normalized === "active" ? "success" : normalized === "closed" ? "outline" : "neutral";
  const label =
    normalized === "draft"
      ? labels.draft
      : normalized === "active"
        ? labels.active
        : normalized === "closed"
          ? labels.closed
          : status;

  return (
    <Badge tone={tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}

export function ScorePill({
  score,
  decimals = 2,
}: {
  score: number | null;
  decimals?: number;
}) {
  if (score == null) {
    return <span className="text-sm text-on-surface-variant">—</span>;
  }

  const bandClass =
    score >= 85
      ? "bg-primary-container text-on-primary"
      : score >= 75
        ? "bg-secondary text-on-secondary"
        : "bg-error text-white";

  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-sm font-semibold tabular-nums ${bandClass}`}
    >
      {score.toFixed(decimals)}
    </span>
  );
}
