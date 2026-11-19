/**
 * The cupping screen's ways out (package S5a of the 2026-11-15 UI/UX audit: C-02, J-04).
 * Pure and dependency-free: the cup page calls these; nothing here saves, submits or syncs.
 *
 * - C-02: the module switcher's "Resultados" only NAVIGATES. The one submit is the
 *   footer's button (the existing `handleGoToResults` path, unchanged).
 * - J-04: every way out (the exit link, the phone's exit, "Resultados", the browser's
 *   back) goes through the same leave guard. After the existing flush, leave at once
 *   when nothing of the cupper's is device-only; otherwise ask, with the guard's
 *   "pending" wording. A closed session never asks: the page is leaving anyway.
 */
import { localeSwitchHref } from "@/lib/localeSwitch";

export type CupExitTarget = "sessions" | "results" | "language";

export type ModuleAction =
  | { kind: "leave"; target: CupExitTarget }
  | { kind: "tab"; tab: "cupping" | "physical" | "extrinsic" }
  | { kind: "none" };

/** What a module of the switcher does. "results" never submits. */
export function moduleAction(key: string): ModuleAction {
  if (key === "results") return { kind: "leave", target: "results" };
  if (key === "cupping" || key === "physical" || key === "extrinsic") return { kind: "tab", tab: key };
  return { kind: "none" };
}

export type ExitState = {
  /** What the existing flush of pending saves returned. */
  flushed: "synced" | "pending";
  /** The page's own "something is device-only" flag (drives the amber state). */
  hasPending: boolean;
  /** Modules still device-only in the durable store (countLocalPending). */
  localPending: number;
  sessionClosed: boolean;
};

/** After the flush: leave at once, or ask first (the leave guard, "pending" wording). */
export function exitDecision(s: ExitState): "leave" | "confirm" {
  if (s.sessionClosed) return "leave";
  if (s.flushed === "pending" || s.hasPending || s.localPending > 0) return "confirm";
  return "leave";
}

/** Where a way out goes. "language" (P5b, D-01) is the same cup page in the other language,
 *  with the query kept (the cupper's sample and step, `lib/cupPlace.ts`). */
export function cupExitHref(locale: string, sessionId: string, target: CupExitTarget, search = ""): string {
  if (target === "language") {
    return localeSwitchHref(`/${locale}/app/sessions/${sessionId}/cup`, search, "", locale === "en" ? "es" : "en");
  }
  return target === "results" ? `/${locale}/app/sessions/${sessionId}/results` : `/${locale}/app/sessions`;
}

/**
 * J-04: whether a session-row update (the realtime event the page already receives)
 * should tell this viewer "La sesión se cerró". Participants only (the owner closed it
 * themselves), once per page.
 */
export function shouldShowClosedNotice(
  row: Record<string, unknown>,
  viewer: { isOwner: boolean; alreadyShown: boolean },
): boolean {
  return row.status === "closed" && !viewer.isOwner && !viewer.alreadyShown;
}
