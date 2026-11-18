"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./CanvasFooter.module.css";

export type NextVariant = "next-sample" | "next-phase" | "view-results";

interface CanvasFooterProps {
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  nextVariant?: NextVariant;
}

export function CanvasFooter({
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  prevDisabled = false,
  nextDisabled = false,
  nextVariant = "next-sample",
}: CanvasFooterProps) {
  // C-10: one green primary for every "next" (sample, stage, notes, submit). The stage
  // change is said in the label; the variant stays only as a data attribute.
  return (
    <div className={styles.bar} role="navigation" aria-label="Step navigation">
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className={`${styles.button} ${styles.prev}`}
      >
        <ArrowLeft size={14} aria-hidden />
        {prevLabel}
      </button>

      <span className={styles.spacer} />

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className={`${styles.button} ${styles.next}`}
        data-variant={nextVariant}
      >
        {nextLabel}
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
