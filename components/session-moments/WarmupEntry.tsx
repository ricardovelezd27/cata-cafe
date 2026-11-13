"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { lw, warmupById } from "@/lib/warmup/exercises";
import { shouldOfferWarmupEntry } from "@/lib/warmup/overlayGate";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { SessionMomentOverlay } from "./SessionMomentOverlay";

const subscribeNoop = () => () => {};

/**
 * The discreet entry to the warm-up on the cup page (S10 WP7, Kim F1): one
 * small text button that opens the session's exercise in session mode, offered
 * when the pre-cupping interstitial is not on screen (`shouldOfferWarmupEntry`).
 * Closing the player, early or at the end, changes nothing: it marks nothing
 * seen and never blocks the cupping. Rendered in the sidebar, so the player
 * is portalled to <body> (a transformed mobile drawer would trap `fixed`).
 */
export function WarmupEntry({
  exerciseId,
  closed,
  overlayOpen,
  isOwner,
  isGroup,
  isAsync,
  startedAt,
  locale,
  label,
  strings,
}: {
  exerciseId: string | null | undefined;
  closed: boolean;
  overlayOpen: boolean;
  isOwner: boolean;
  isGroup: boolean;
  isAsync: boolean;
  startedAt: boolean;
  locale: string;
  /** Raw `warmup.entry.label` ("Movimiento Sensorial · {min} min"). */
  label?: string;
  strings: WarmupPlayerStrings;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const exercise = warmupById(exerciseId);
  if (!exercise) return null;
  const offered = !!label && shouldOfferWarmupEntry({ exerciseId, sessionClosed: closed, overlayOpen, isOwner, isGroup, isAsync, startedAt });
  const close = () => setOpen(false);
  return (
    <>
      {offered && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] items-center text-left text-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container"
        >
          {label.replace("{min}", String(exercise.durationMin))}
        </button>
      )}
      {open && mounted &&
        createPortal(
          <SessionMomentOverlay open label={lw(exercise.name, locale)}>
            <WarmupPlayer exercise={exercise} locale={locale} t={strings} mode="session" onFinish={close} onExit={close} />
          </SessionMomentOverlay>,
          document.body,
        )}
    </>
  );
}
