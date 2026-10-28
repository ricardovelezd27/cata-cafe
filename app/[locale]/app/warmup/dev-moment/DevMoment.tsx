"use client";

import { useState, useSyncExternalStore } from "react";
import { clearMomentSeen, seenMomentValue, sessionMomentKey, subscribeMoments } from "@/lib/sessionMoments";
import { WarmupMoment } from "@/components/session-moments/WarmupMoment";
import type { WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";

const DEV_USER = "dev-user";

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
  const [hasEval, setHasEval] = useState(false);
  const [liveOwner, setLiveOwner] = useState(false);
  const seen = useSyncExternalStore(
    subscribeMoments,
    () => seenMomentValue("warmup", sessionId, DEV_USER),
    () => null,
  );
  const btn =
    "rounded-pill border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container";
  return (
    <div className="space-y-4" data-dev-moment>
      <p className="text-xs text-on-surface-variant">
        dev · session moment · key <code>{sessionMomentKey("warmup", sessionId, DEV_USER)}</code> · seen value:{" "}
        <span data-seen>{String(seen)}</span> · epoch {epoch}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => {
            clearMomentSeen("warmup", sessionId, DEV_USER);
            setEpoch((e) => e + 1);
          }}
        >
          Clear seen + remount
        </button>
        <button type="button" className={btn} onClick={() => setEnabled((v) => !v)}>
          enabled: {String(enabled)}
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setHasEval((v) => !v);
            setEpoch((e) => e + 1);
          }}
        >
          hasOwnEvaluation: {String(hasEval)}
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setLiveOwner((v) => !v);
            setEpoch((e) => e + 1);
          }}
        >
          live group owner: {String(liveOwner)}
        </button>
      </div>
      <p className="text-sm text-on-surface">
        Page content behind the overlay. The overlay should open once per (session, user, exercise), and never again
        after skip/finish. The gate is frozen at mount (remount to re-evaluate).
      </p>
      <WarmupMoment
        key={epoch}
        sessionId={sessionId}
        userId={DEV_USER}
        locale={locale}
        exerciseId={exerciseId}
        hasOwnEvaluation={hasEval}
        isOwner={liveOwner}
        isGroup={liveOwner}
        isAsync={false}
        enabled={enabled}
        strings={strings}
      />
    </div>
  );
}
