import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  subtext: string;
  accent?: boolean;
  icon?: ReactNode;
}

export function StatCard({ label, value, subtext, accent, icon }: StatCardProps) {
  return (
    <div className="relative bg-surface-container-lowest rounded-card border border-outline-variant shadow-card p-5 flex flex-col gap-1">
      {icon && (
        <span className="absolute top-4 right-4 text-primary-muted opacity-70">
          {icon}
        </span>
      )}
      {/* The icon sits in the top-right corner: a label that reaches it wraps instead. */}
      <span className={`label-caps ${icon ? "pr-7" : ""}`}>
        {label}
      </span>
      <span
        className={`font-display text-4xl leading-none mt-1 tabular-nums ${
          accent ? "text-secondary" : "text-on-surface"
        }`}
      >
        {value}
      </span>
      <span className="text-caption text-on-surface-variant mt-1">{subtext}</span>
    </div>
  );
}
