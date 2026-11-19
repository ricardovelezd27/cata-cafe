"use client";

import { useState, useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { deadlineState } from "@/lib/closeRules";
import { formatDeadlineInstant } from "@/lib/deadlineFormat";
import { Notice } from "@/components/ui/Notice";

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
  // and the cutoff time in the owner's zone. Never `dateStyle`/`timeStyle` with
  // `timeZoneName`: Intl throws on that mix (lib/deadlineFormat.ts).
  const ownerText = formatDeadlineInstant(at, bcp, ownerZone, true);

  let viewerZone = ownerZone;
  try {
    viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ownerZone;
  } catch {
    // keep ownerZone: no local line
  }
  const zonesDiffer = viewerZone !== ownerZone;
  const localText = zonesDiffer ? formatDeadlineInstant(at, bcp, viewerZone, false) : null;

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

  // P2b (E-05): a Notice. An open deadline is information; one that is near or has
  // passed needs attention (warning), never terracotta. Same text, same role.
  return (
    <Notice tone={state === "open" ? "info" : "warning"} icon={<Clock size={14} aria-hidden />}>
      <span className={state === "open" ? "" : "font-medium"}>{text}</span>
      {local ? <span className="block opacity-80">{local}</span> : null}
    </Notice>
  );
}
