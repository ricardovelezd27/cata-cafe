import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

interface StatCardProps {
  label: string;
  value: string;
  subtext: string;
  accent?: boolean;
  icon?: ReactNode;
}

export function StatCard({ label, value, subtext, accent, icon }: StatCardProps) {
  return (
    // P2b (D-07): a Card (one border, no shadow). The 240 px stat cap is not applied:
    // the dashboard's stat grid would leave gaps (listed in the P2b pull request).
    <Card className="relative flex flex-col gap-1">
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
    </Card>
  );
}
