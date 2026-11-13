"use client";

// S10 WP4b (Kim C1, `TODO(kim-validar:C1)`): the close announced a few minutes
// ahead. Two surfaces over the pure rules in lib/closeAnnounce.ts:
//  - CloseAnnounceBanner: what a cupper sees. Calm, persistent, never blocks input,
//    no sound, no modal. The text only changes once per minute, so the polite live
//    region announces at most once a minute.
//  - OwnerCloseLine: the owner's docked line with the countdown, "Cerrar ahora" and
//    "Cancelar". When the countdown runs out WHILE this page is open it calls
//    `onCloseNow` (the same close the dialog confirmed). A page opened after the
//    moment passed never closes anything by itself: it says so and waits.
// Clock skew: `serverNow` (ISO, from the page render) fixes the countdown against the
// server clock the way the synced warm-up run does (lib/closeAnnounce.ts).

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui";
import {
  bannerState,
  formatClock,
  minuteBucket,
  ownerLineState,
  parseDbTimestamp,
  remainingMs,
  shouldAutoClose,
  skewMs,
} from "@/lib/closeAnnounce";

export type CloseBannerTranslations = {
  /** RAW with "{time}". */
  counting: string;
  due: string;
  /** RAW with "{n}". */
  minutes: string;
  lessThanMinute: string;
};

export type OwnerCloseLineTranslations = {
  /** RAW with "{time}" (m:ss). */
  counting: string;
  passed: string;
  closeNow: string;
  cancel: string;
  closing: string;
  error: string;
};

const noopSubscribe = () => () => {};

/** Ticks once a second while there is an announcement; `now` is the client clock. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** server - client, taken once at mount from the page's own `serverNow`. */
function useInitialSkew(serverNow: string | undefined): number {
  const [skew] = useState(() => {
    const sn = parseDbTimestamp(serverNow);
    return sn === null ? 0 : skewMs(sn, Date.now());
  });
  return skew;
}

export function CloseAnnounceBanner({
  closingAtMs,
  serverNow,
  sessionClosed,
  translations: t,
}: {
  closingAtMs: number | null;
  serverNow?: string;
  sessionClosed: boolean;
  translations: CloseBannerTranslations;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const skew = useInitialSkew(serverNow);
  const now = useTick(closingAtMs !== null);
  const state = bannerState({ closingAtMs, clientNowMs: now, skew, sessionClosed });

  let text: string | null = null;
  if (mounted && state.kind === "due") text = t.due;
  if (mounted && state.kind === "counting") {
    const bucket = minuteBucket(state.remainingMs);
    const time = bucket <= 1 ? t.lessThanMinute : t.minutes.replace("{n}", String(bucket));
    text = t.counting.replace("{time}", time);
  }

  // The live region is always in the DOM so a banner that appears is announced.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {text && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6">
          <Clock size={14} aria-hidden className="mt-0.5 shrink-0 text-secondary" />
          <span className="flex-1">{text}</span>
        </div>
      )}
    </div>
  );
}

export function OwnerCloseLine({
  closingAtMs,
  serverNow,
  sessionClosed,
  onCloseNow,
  onCancel,
  translations: t,
}: {
  closingAtMs: number | null;
  serverNow?: string;
  sessionClosed: boolean;
  /** The same close the dialog confirmed; may throw (network). */
  onCloseNow: () => Promise<unknown>;
  /** Takes the announcement back; resolves false when it failed. */
  onCancel: () => Promise<boolean>;
  translations: OwnerCloseLineTranslations;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const skew = useInitialSkew(serverNow);
  const now = useTick(closingAtMs !== null);
  const [busy, setBusy] = useState<"closing" | "cancelling" | null>(null);
  const [failed, setFailed] = useState(false);
  const sawTimeLeft = useRef(false);
  const tried = useRef(false);

  const state = ownerLineState({ closingAtMs, clientNowMs: now, skew, sessionClosed });
  const left = closingAtMs === null ? Number.POSITIVE_INFINITY : remainingMs(closingAtMs, now, skew);

  const closeNow = async () => {
    setBusy("closing");
    setFailed(false);
    try {
      await onCloseNow();
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };

  // A new announcement (or none) starts the watch over.
  useEffect(() => {
    sawTimeLeft.current = false;
    tried.current = false;
  }, [closingAtMs]);

  useEffect(() => {
    if (state.kind === "counting") sawTimeLeft.current = true;
    if (shouldAutoClose({ sawTimeLeft: sawTimeLeft.current, remainingMs: left, alreadyTried: tried.current })) {
      tried.current = true;
      void closeNow();
    }
    // closeNow is recreated every render and only reads the latest props through the ref-guarded path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, left]);

  if (!mounted || state.kind === "none") return null;

  const cancel = async () => {
    setBusy("cancelling");
    setFailed(false);
    const ok = await onCancel();
    if (!ok) setFailed(true);
    setBusy(null);
  };

  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-card border border-secondary/30 bg-secondary-container/20 px-4 py-2 font-sans text-sm text-on-surface lg:mx-6">
      <Clock size={14} aria-hidden className="shrink-0 text-secondary" />
      <span className="min-w-[200px] flex-1">
        {busy === "closing"
          ? t.closing
          : state.kind === "counting"
            ? t.counting.replace("{time}", formatClock(state.remainingMs))
            : t.passed}
        {failed && <span className="mt-1 block text-error">{t.error}</span>}
      </span>
      <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void closeNow()}>
        {t.closeNow}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void cancel()}>
        {t.cancel}
      </Button>
    </div>
  );
}
