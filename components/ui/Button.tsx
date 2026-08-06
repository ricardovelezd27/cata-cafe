"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Canonical action button — codifies DESIGN.md's "Buttons" patterns as a
 * single component instead of hand-rolled class strings scattered across
 * pages. A Button always PERFORMS AN ACTION (navigate, mutate, trigger); it
 * is never a selector — see PillTabs/SegmentedControl for that role.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "accentOutline";
export type ButtonSize = "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-pill font-medium transition-colors min-h-[44px] whitespace-nowrap disabled:opacity-60 disabled:cursor-default";

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-5 text-sm",
  sm: "px-3.5 text-xs",
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary-container text-on-primary hover:bg-primary",
  secondary: "border border-primary-container text-primary-container hover:bg-primary-fixed",
  ghost: "text-on-surface-variant hover:text-on-surface",
  accent: "bg-secondary text-on-secondary hover:opacity-90",
  accentOutline: "border border-secondary text-secondary hover:bg-secondary-fixed",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon — sized and aria-hidden by the caller (e.g. `<Printer size={16} aria-hidden />`). */
  icon?: ReactNode;
  className?: string;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
}

/** Same visual vocabulary as Button, rendered as an anchor — for plain-link
 * actions like a server-generated PDF download where no client JS should ship. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      href={href}
      className={`${BASE} ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} no-underline ${className}`}
      {...props}
    >
      {icon}
      {children}
    </a>
  );
}
