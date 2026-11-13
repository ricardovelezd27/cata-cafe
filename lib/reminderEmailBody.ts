// Pure subject/body builders for the two system reminders (S8-05). No prisma or
// server-only imports so they are unit-testable; lib/reminderEmail.ts owns the
// sending and the ledger (session_reminder_deliveries).

import { escapeHtml } from "@/lib/email";
import type { ReminderKind } from "@/lib/closeRules";

export type ReminderLocale = "es" | "en";

const TEXT: Record<
  ReminderLocale,
  Record<ReminderKind, { subject: (name: string) => string; body: (nameHtml: string) => string; cta: string }>
> = {
  es: {
    deadline_24h: {
      subject: (name) => `Cierra pronto: ${name}`,
      body: (n) =>
        `La sesión <strong>${n}</strong> cierra en menos de 24 horas y tienes notas sin enviar. Las notas que sigan sin enviar al cerrar no cuentan en los resultados.`,
      cta: "Terminar y enviar mis notas",
    },
    live_idle: {
      subject: (name) => `Tu cata sigue abierta: ${name}`,
      body: (n) =>
        `La sesión en vivo <strong>${n}</strong> lleva un día sin actividad y sigue abierta. Ciérrala desde el panel cuando termines; si pasan 7 días sin actividad, la cerramos por ti.`,
      cta: "Abrir el panel de la cata",
    },
  },
  en: {
    deadline_24h: {
      subject: (name) => `Closing soon: ${name}`,
      body: (n) =>
        `The session <strong>${n}</strong> closes in less than 24 hours and you have notes that are still unsent. Notes still unsent when it closes are not counted in the results.`,
      cta: "Finish and send my notes",
    },
    live_idle: {
      subject: (name) => `Your cupping is still open: ${name}`,
      body: (n) =>
        `The live session <strong>${n}</strong> has had no activity for a day and is still open. Close it from the panel when you are done; after 7 days without activity we close it for you.`,
      cta: "Open the cupping panel",
    },
  },
};

export function reminderSubject(kind: ReminderKind, locale: ReminderLocale, sessionName: string): string {
  return TEXT[locale][kind].subject(sessionName);
}

export function loginNextUrl(origin: string, locale: string, path: string): string {
  return `${origin}/${locale}/auth/login?next=${encodeURIComponent(path)}`;
}

/** Where the reminder sends the recipient: members go to the cup screen, the
 *  owner of an idle live session to the same screen (the master panel). */
export function reminderPath(locale: string, sessionId: string): string {
  return `/${locale}/app/sessions/${sessionId}/cup`;
}

export function buildReminderHtml(args: {
  kind: ReminderKind;
  locale: ReminderLocale;
  sessionName: string;
  url: string;
}): string {
  const t = TEXT[args.locale][args.kind];
  return `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
        <h2 style="color:#3D5A3E; margin:0 0 8px;">Café Sensible</h2>
        <p>${t.body(escapeHtml(args.sessionName))}</p>
        <p style="margin:20px 0;">
          <a href="${escapeHtml(args.url)}" style="display:inline-block; background:#3D5A3E; color:#ffffff; text-decoration:none; font-weight:bold; padding:12px 24px; border-radius:8px;">${t.cta}</a>
        </p>
      </div>`;
}
