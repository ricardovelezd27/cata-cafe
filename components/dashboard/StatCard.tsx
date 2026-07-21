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
    <div className="relative bg-white rounded-card border border-[#E8E0D0] shadow-card p-5 flex flex-col gap-1">
      {icon && (
        <span className="absolute top-4 right-4 text-green-mid opacity-70">
          {icon}
        </span>
      )}
      <span className="text-xs font-semibold text-brown-mid uppercase tracking-wide">
        {label}
      </span>
      <span
        className="font-display text-4xl leading-none mt-1"
        style={{ color: accent ? "#C17817" : "var(--color-brown-dark)" }}
      >
        {value}
      </span>
      <span className="text-xs text-brown-mid mt-1">{subtext}</span>
    </div>
  );
}
