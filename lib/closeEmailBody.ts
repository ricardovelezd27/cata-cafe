// Pure subject/body builder for the group-close email (no prisma / server-only
// imports so it is unit-testable). lib/closeEmail.ts owns sending + ledger.

import { escapeHtml } from "@/lib/email";

export type CloseEmailLocale = "es" | "en";

const TEXT: Record<
  CloseEmailLocale,
  {
    subject: (name: string) => string;
    hello: string;
    closed: (nameHtml: string, dateHtml: string) => string;
    cta: string;
    attached: string;
    thanks: string;
  }
> = {
  es: {
    subject: (name) => `Resultados — ${name}`,
    hello: "Hola,",
    closed: (n, d) => `La sesión <strong>${n}</strong>${d} se ha cerrado.`,
    cta: "Ver mis resultados",
    attached:
      "Adjuntamos tu resumen personal en PDF. Puedes descargar el formulario CVA completo desde la página de resultados.",
    thanks: "Gracias por participar.",
  },
  en: {
    subject: (name) => `Results — ${name}`,
    hello: "Hello,",
    closed: (n, d) => `The session <strong>${n}</strong>${d} has been closed.`,
    cta: "View my results",
    attached:
      "Your personal summary PDF is attached. You can download the full CVA form from the results page.",
    thanks: "Thank you for taking part.",
  },
};

export function closeEmailSubject(locale: CloseEmailLocale, sessionName: string): string {
  return TEXT[locale].subject(sessionName);
}

export function buildCloseEmailHtml(args: {
  locale: CloseEmailLocale;
  sessionName: string;
  dateStr: string;
  resultsUrl: string;
}): string {
  const t = TEXT[args.locale];
  const date = args.dateStr ? ` (${escapeHtml(args.dateStr)})` : "";
  const href = escapeHtml(args.resultsUrl);
  return `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
        <h2 style="color:#3D5A3E; margin:0 0 8px;">Café Sensible</h2>
        <p>${t.hello}</p>
        <p>${t.closed(escapeHtml(args.sessionName), date)}</p>
        <p style="margin:20px 0;">
          <a href="${href}" style="display:inline-block; background:#3D5A3E; color:#ffffff; text-decoration:none; font-weight:bold; padding:12px 24px; border-radius:8px;">${t.cta}</a>
        </p>
        <p>${t.attached}</p>
        <p style="color:#7a7168; font-size:13px;">${t.thanks}</p>
      </div>`;
}
