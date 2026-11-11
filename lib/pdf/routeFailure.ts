// Shared failure response for the PDF routes (S8-12, F-informes-5): a plain-text
// 500 carrying a short digest the person can quote, plus ONE structured log
// line with the same digest so support can find it in Vercel Logs. Mirrors the
// local helper the participant-summary / ficha routes already use.

import { logError, errorMessage } from "@/lib/log";

const SERVER_ERROR = {
  es: "No se pudo generar el PDF. Inténtalo de nuevo en unos minutos.",
  en: "The PDF could not be generated. Please try again in a few minutes.",
} as const;

export function pdfFailureResponse(
  where: string,
  ids: { sessionId?: string; coffeeId?: string },
  locale: "es" | "en",
  err: unknown,
): Response {
  const digest = Math.random().toString(36).slice(2, 10);
  logError({ where, code: "pdf_render_failed", digest, locale, ...ids, message: errorMessage(err) });
  return new Response(`${SERVER_ERROR[locale]} (${digest})`, {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
