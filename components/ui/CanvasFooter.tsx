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
  const nextClass =
    nextVariant === "next-phase" ? styles.nextPhase : styles.next;

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
        className={`${styles.button} ${nextClass}`}
      >
        {nextLabel}
        <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
