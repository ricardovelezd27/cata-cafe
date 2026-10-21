"use client";

import styles from "./Notes.module.css";

interface NotesProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Accessible label, hidden visually. */
  ariaLabel?: string;
  maxLength?: number;
}

export function Notes({
  value,
  onChange,
  placeholder = "Notas...",
  rows = 2,
  ariaLabel,
  maxLength,
}: NotesProps) {
  return (
    <textarea
      className={styles.field}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      aria-label={ariaLabel ?? placeholder}
    />
  );
}
