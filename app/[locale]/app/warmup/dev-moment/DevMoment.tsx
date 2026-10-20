"use client";

import { useState, useSyncExternalStore } from "react";
import { clearMomentSeen, hasSeenMoment, sessionMomentKey, subscribeMoments } from "@/lib/sessionMoments";
import { WarmupMoment } from "@/components/session-moments/WarmupMoment";
import type { WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";

export function DevMoment({
  locale,
  exerciseId,
  sessionId,
  strings,
}: {
  locale: string;
  exerciseId: string;
  sessionId: string;
  strings: WarmupPlayerStrings;
}) {
  const [epoch, setEpoch] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const seen = useSyncExternalStore(subscribeMoments, () => hasSeenMoment("warmup", sessionId), () => false);
  const btn =
    "rounded-pill border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container";
  return (
    <div className="space-y-4" data-dev-moment>
      <p className="text-xs text-on-surface-variant">
        dev · session moment · key <code>{sessionMomentKey("warmup", sessionId)}</code> · seen:{" "}
        <span data-seen>{String(seen)}</span> · epoch {epoch}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => {
            clearMomentSeen("warmup", sessionId);
            setEpoch((e) => e + 1);
          }}
        >
          Clear seen + remount
        </button>
        <button type="button" className={btn} onClick={() => setEnabled((v) => !v)}>
          enabled: {String(enabled)}
        </button>
      </div>
      <p className="text-sm text-on-surface">
        Page content behind the overlay. The overlay should open once, and never again after skip/finish.
      </p>
      <WarmupMoment
        key={epoch}
        sessionId={sessionId}
        locale={locale}
        exerciseId={exerciseId}
        enabled={enabled}
        strings={strings}
      />
    </div>
  );
}
