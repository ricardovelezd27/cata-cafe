"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./FormSection.module.css";
import { cardClasses } from "./cardRecipe";

interface FormSectionProps {
  /** Eyebrow label, in capitals. e.g. "FRAGANCIA" */
  title: string;
  /** Optional display-font headline below the eyebrow. */
  headline?: string;
  /** Render the title in green-dark (accent) instead of brown-mid. */
  accent?: boolean;
  /** Mark this section as missing a required field — red title + asterisk, until resolved. */
  flagged?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FormSection({
  title,
  headline,
  accent = false,
  flagged = false,
  collapsible = false,
  defaultOpen = true,
  children,
}: FormSectionProps) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);

  return (
    // Under 360 px the card gives way: it reaches 12 px into the page's side margin and keeps
    // 12 px of padding, so the nine 34 px quality bubbles fit a 320 px phone (AffectiveBubbles).
    <section
      className={`${cardClasses({ tone: "quiet" })} mb-[12px] md:mb-[16px] max-[360px]:-mx-[12px] max-[360px]:px-[12px] ${styles.section}`}
    >
      <div
        className={`${styles.header} ${collapsible ? styles.clickable : ""}`}
        onClick={() => collapsible && setOpen((v) => !v)}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? open : undefined}
      >
        <div>
          <h3
            className={`${styles.title} ${accent ? styles.titleAccent : ""} ${
              flagged ? styles.titleFlagged : ""
            }`}
          >
            {title}
            {flagged && (
              <span className={styles.flagMark} aria-label="incompleto">
                {" "}
                *
              </span>
            )}
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
