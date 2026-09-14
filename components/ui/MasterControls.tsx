"use client";

import { Link2, X, Copy, RotateCcw, Check, Play } from "lucide-react";
import { InviteQR } from "./InviteQR";
import styles from "./MasterControls.module.css";

interface MasterControlsProps {
  /** Header label, e.g. "Panel de maestro" */
  title: string;
  /** Pre-formatted "{n} de {total} enviaron" string */
  submittedLabel: string;
  /** Shown under the count when the realtime channel is not SUBSCRIBED, so the
   *  maestro knows the submitted total may be stale rather than simply flat. */
  liveDownLabel?: string;
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
  /** "Copiar QR" */
  qrCopyImageLabel: string;
  /** "Descargar QR" */
  qrDownloadLabel: string;
  sessionClosed: boolean;
  inviteLink: string | null;
  isGenerating: boolean;
  isCopied: boolean;
  onClose: () => void;
  onGenerate: () => void;
  onCopy: () => void;
  onResetInvite: () => void;
  /** "Iniciar cata" / "Start tasting" */
  startLabel?: string;
  /** "Iniciando…" / "Starting…" */
  startingLabel?: string;
  /** Renders the start button before the invite block when true. */
  showStart?: boolean;
  isStarting?: boolean;
  onStart?: () => void;
}

export function MasterControls({
  title,
  submittedLabel,
  liveDownLabel,
  closeLabel,
  inviteLabel,
  generatingLabel,
  copyLabel,
  copiedLabel,
  qrCopyImageLabel,
  qrDownloadLabel,
  sessionClosed,
  inviteLink,
  isGenerating,
  isCopied,
  onClose,
  onGenerate,
  onCopy,
  onResetInvite,
  startLabel,
  startingLabel,
  showStart = false,
  isStarting = false,
  onStart,
}: MasterControlsProps) {
  return (
    <section className={styles.wrap} aria-label={title}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{submittedLabel}</span>
      </div>

      {liveDownLabel && (
        <p role="status" className={styles.liveDown}>
          {liveDownLabel}
        </p>
      )}

      <div className={styles.row}>
        {showStart && (
          <button
            type="button"
            onClick={onStart}
            disabled={isStarting || sessionClosed}
            className={`${styles.button} ${styles.start}`}
          >
            <Play size={14} aria-hidden />
            {isStarting ? startingLabel : startLabel}
          </button>
        )}
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
          <div className={styles.inviteBlock}>
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
            <div className={styles.qrSlot}>
              <InviteQR
                url={inviteLink}
                size={128}
                labels={{ copyImage: qrCopyImageLabel, download: qrDownloadLabel, copied: copiedLabel }}
              />
            </div>
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
