"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import styles from "./CanvasFooter.module.css";

export type SaveStatus = "idle" | "saving" | "saved";
export type NextVariant = "next-sample" | "next-phase" | "view-results";

interface CanvasFooterProps {
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  nextVariant?: NextVariant;
  saveStatus?: SaveStatus;
  savingLabel?: string;
  savedLabel?: string;
}

export function CanvasFooter({
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  prevDisabled = false,
  nextDisabled = false,
  nextVariant = "next-sample",
  saveStatus = "idle",
  savingLabel = "Saving…",
  savedLabel = "Saved",
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

      <span className={styles.spacer}>
        {saveStatus === "saving" && (
          <span className={styles.status}>
            <span className={`${styles.dot} ${styles.dotSaving}`} aria-hidden />
            {savingLabel}
          </span>
        )}
        {saveStatus === "saved" && (
          <span className={`${styles.status} ${styles.saved}`}>
            <span className={styles.dot} aria-hidden />
            {savedLabel}
          </span>
        )}
      </span>

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
