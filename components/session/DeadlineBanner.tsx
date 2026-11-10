"use client";

import { useState, useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { deadlineState } from "@/lib/closeRules";

export type DeadlineBannerTranslations = {
  // RAW templates containing the literal "{when}" / "{local}" -- filled here,
  // client-side, because the viewer's zone and clock are only known in the browser.
  open: string;
  soon: string;
  passed: string;
  local: string;
};

const noopSubscribe = () => () => {};

// The session's closing date, shown to everyone who can open the session
// (join confirmation, waiting screen, cup header, session list). It reads
// "the end of the day the owner picked" in the OWNER's zone, with the viewer's
// local time beside it when the zones differ, and turns stronger in the last
// 24 hours. Renders nothing without a date (never an empty banner) and nothing
// on the server render (the viewer's zone is unknown there).
export function DeadlineBanner({
  closesAt,
  zone,
  locale,
  translations: t,
  compact = false,
}: {
  closesAt: string | null;
  zone: string | null;
  locale: string;
  translations: DeadlineBannerTranslations;
  /** One-line plain text for dense rows (no box). */
  compact?: boolean;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [now] = useState(() => Date.now());
  if (!mounted || !closesAt) return null;

  const state = deadlineState(closesAt, now);
  if (state === "none") return null;

  const bcp = locale === "en" ? "en-US" : "es-CO";
  const ownerZone = zone ?? "UTC";
  const at = new Date(closesAt);
  // The stored instant is 23:59:59.999 of the picked day; show the picked day
  // and the cutoff time in the owner's zone.
  const ownerText = new Intl.DateTimeFormat(bcp, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ownerZone,
    timeZoneName: "short",
  }).format(at);

  let viewerZone = ownerZone;
  try {
    viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ownerZone;
  } catch {
    // keep ownerZone: no local line
  }
  const zonesDiffer = viewerZone !== ownerZone;
  const localText = zonesDiffer
    ? new Intl.DateTimeFormat(bcp, { dateStyle: "medium", timeStyle: "short", timeZone: viewerZone }).format(at)
    : null;

  const template = state === "passed" ? t.passed : state === "soon" ? t.soon : t.open;
  const text = template.replace("{when}", ownerText);
  const local = localText ? t.local.replace("{local}", localText) : null;

  if (compact) {
    return (
      <span className={state === "open" ? "text-on-surface-variant" : "text-secondary font-medium"}>
        {text}
        {local ? ` · ${local}` : ""}
      </span>
    );
  }

  const tone =
    state === "open"
      ? "border-outline-variant bg-surface-container-low text-on-surface"
      : "border-secondary/30 bg-secondary-container/20 text-on-surface";

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-card border px-4 py-2 font-sans text-sm ${tone}`}
    >
      <Clock size={14} aria-hidden className="mt-0.5 shrink-0 text-secondary" />
      <span className="flex-1">
        <span className={state === "open" ? "" : "font-medium"}>{text}</span>
        {local ? <span className="block text-on-surface-variant">{local}</span> : null}
      </span>
    </div>
  );
}
