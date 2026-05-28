"use client";

import { Link2, X, Copy, RotateCcw, Check } from "lucide-react";
import styles from "./MasterControls.module.css";

interface MasterControlsProps {
  /** Header label, e.g. "Panel de maestro" */
  title: string;
  /** Pre-formatted "{n} de {total} enviaron" string */
  submittedLabel: string;
  /** "Cerrar sesión" / "Close session" */
  closeLabel: string;
  /** "Invitar participantes" / "Invite participants" */
  inviteLabel: string;
  /** "Generando…" */
  generatingLabel: string;
  /** "Copiar" */
  copyLabel: string;
  /** "Copiado" */
  copiedLabel: string;
  sessionClosed: boolean;
  inviteLink: string | null;
  isGenerating: boolean;
  isCopied: boolean;
  onClose: () => void;
  onGenerate: () => void;
  onCopy: () => void;
  onResetInvite: () => void;
}

export function MasterControls({
  title,
  submittedLabel,
  closeLabel,
  inviteLabel,
  generatingLabel,
  copyLabel,
  copiedLabel,
  sessionClosed,
  inviteLink,
  isGenerating,
  isCopied,
  onClose,
  onGenerate,
  onCopy,
  onResetInvite,
}: MasterControlsProps) {
  return (
    <section className={styles.wrap} aria-label={title}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{submittedLabel}</span>
      </div>

      <div className={styles.row}>
        {!inviteLink ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || sessionClosed}
            className={`${styles.button} ${styles.invite}`}
          >
            <Link2 size={14} aria-hidden />
            {isGenerating ? generatingLabel : inviteLabel}
          </button>
        ) : (
          <div className={styles.inviteSlot}>
            <span className={styles.inviteUrl} title={inviteLink}>
              {inviteLink}
            </span>
            <button
              type="button"
              onClick={onCopy}
              className={`${styles.iconBtn} ${styles.copyBtn} ${
                isCopied ? styles.copied : ""
              }`}
            >
              {isCopied ? (
                <>
                  <Check size={12} aria-hidden /> {copiedLabel}
                </>
              ) : (
                <>
                  <Copy size={12} aria-hidden /> {copyLabel}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onResetInvite}
              className={`${styles.iconBtn} ${styles.resetBtn}`}
              aria-label="Reset invite link"
            >
              <RotateCcw size={12} aria-hidden />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={sessionClosed}
          className={`${styles.button} ${styles.close}`}
        >
          <X size={14} aria-hidden />
          {closeLabel}
        </button>
      </div>
    </section>
  );
}
