"use client";

import styles from "./Notes.module.css";

interface NotesProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Accessible label, hidden visually. */
  ariaLabel?: string;
}

export function Notes({
  value,
  onChange,
  placeholder = "Notas...",
  rows = 2,
  ariaLabel,
}: NotesProps) {
  return (
    <textarea
      className={styles.field}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel ?? placeholder}
    />
  );
}
