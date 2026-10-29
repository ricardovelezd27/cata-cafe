"use client";

import { Link2, X, Copy, RotateCcw, Check, Play, PersonStanding, Square } from "lucide-react";
import { InviteQR } from "./InviteQR";
import { Select } from "./Select";
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
  /** Reference-sample select (rendered only when options + handler are given).
   *  "Muestra de referencia" label; options include the "Sin referencia" entry
   *  with value "" — the caller owns the list. */
  referenceLabel?: string;
  referenceOptions?: { value: string; label: string }[];
  referenceValue?: string;
  onReferenceChange?: (value: string) => void;
  /** "R1: A · R2: D (activa)" — current references, shown above the select. */
  referenceSummary?: string;
  /** Notice shown under the select once a reference exists (the new one pins, the old keeps its 79.00). */
  referenceHint?: string;
  /** Synced warm-up run (S6 warm-up v3 PR3) — rendered only before the
   *  cupping starts and when the session has an exercise configured. */
  warmup?: {
    /** "Los ojos · 5 min" */
    exerciseLabel: string;
    startLabel: string;
    stopLabel: string;
    reopenLabel: string;
    runningLabel: string;
    /** Pre-formatted "Quedan 3:12" (null when not running). */
    timeLeft: string | null;
    running: boolean;
    pending: boolean;
    onStart: () => void;
    onStop: () => void;
    onReopen: () => void;
  };
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
  referenceLabel,
  referenceOptions,
  referenceValue = "",
  onReferenceChange,
  referenceSummary,
  referenceHint,
  warmup,
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

      {referenceOptions && onReferenceChange && (
        <fieldset className={styles.referenceField} disabled={sessionClosed}>
          <span className={styles.referenceLabel}>{referenceLabel}</span>
          {referenceSummary && <span className={styles.referenceSummary}>{referenceSummary}</span>}
          <Select
            value={referenceValue}
            onChange={onReferenceChange}
            options={referenceOptions}
            ariaLabel={referenceLabel ?? "Reference sample"}
          />
          {referenceHint && <span className={styles.referenceSummary}>{referenceHint}</span>}
        </fieldset>
      )}

      {showStart && warmup && (
        <fieldset className={styles.referenceField} disabled={sessionClosed} data-warmup-sync>
          <span className={styles.referenceLabel}>{warmup.exerciseLabel}</span>
          {warmup.running ? (
            <>
              <span className={styles.referenceSummary} role="status">
                {warmup.runningLabel}
                {warmup.timeLeft ? ` · ${warmup.timeLeft}` : ""}
              </span>
              <div className={styles.row}>
                <button type="button" onClick={warmup.onReopen} className={`${styles.button} ${styles.invite}`}>
                  <PersonStanding size={14} aria-hidden />
                  {warmup.reopenLabel}
                </button>
                <button
                  type="button"
                  onClick={warmup.onStop}
                  disabled={warmup.pending}
                  className={`${styles.button} ${styles.close}`}
                >
                  <Square size={14} aria-hidden />
                  {warmup.stopLabel}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={warmup.onStart}
              disabled={warmup.pending}
              className={`${styles.button} ${styles.invite}`}
            >
              <PersonStanding size={14} aria-hidden />
              {warmup.startLabel}
            </button>
          )}
        </fieldset>
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
