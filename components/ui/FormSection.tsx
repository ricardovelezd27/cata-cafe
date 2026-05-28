"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./FormSection.module.css";

interface FormSectionProps {
  /** Eyebrow label, mono uppercase. e.g. "FRAGANCIA" */
  title: string;
  /** Optional display-font headline below the eyebrow. */
  headline?: string;
  /** Render the title in green-dark (accent) instead of brown-mid. */
  accent?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FormSection({
  title,
  headline,
  accent = false,
  collapsible = false,
  defaultOpen = true,
  children,
}: FormSectionProps) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);

  return (
    <section className={styles.section}>
      <div
        className={`${styles.header} ${collapsible ? styles.clickable : ""}`}
        onClick={() => collapsible && setOpen((v) => !v)}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? open : undefined}
      >
        <div>
          <h3
            className={`${styles.title} ${accent ? styles.titleAccent : ""}`}
          >
            {title}
          </h3>
          {headline && <div className={styles.headline}>{headline}</div>}
        </div>
        {collapsible && (
          <span
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
            aria-hidden
          >
            <ChevronDown size={16} />
          </span>
        )}
      </div>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}
