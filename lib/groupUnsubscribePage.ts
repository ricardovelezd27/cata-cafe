import { escapeHtml } from "@/lib/email";

// The three tiny pages of the public unsubscribe route (S8-20). Pure strings so
// they are testable; the route picks the language from Accept-Language. The
// pages are deliberately plain and use no app tokens or scripts: they must work
// outside the app, from any mail client's in-app browser.

export type UnsubLocale = "es" | "en";

export function localeFromAcceptLanguage(header: string | null): UnsubLocale {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "es";
}

const COPY = {
  es: {
    title: "Correos del grupo",
    confirm: (g: string) => `¿Dejar de recibir los correos del grupo "${g}"?`,
    confirmNote: "Seguirás viendo el grupo en la app. Puedes volver a recibirlos desde la página del grupo.",
    button: "Darme de baja",
    done: "Listo. Ya no recibirás los correos de este grupo.",
    invalid: "Este enlace no es válido.",
  },
  en: {
    title: "Group emails",
    confirm: (g: string) => `Stop receiving emails from the group "${g}"?`,
    confirmNote: "You will still see the group in the app. You can turn them back on from the group page.",
    button: "Unsubscribe",
    done: "Done. You will no longer receive this group's emails.",
    invalid: "This link is not valid.",
  },
} as const;

function shell(locale: UnsubLocale, body: string): string {
  const c = COPY[locale];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(c.title)}</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#2b241d;background:#faf6ee;"><main style="max-width:420px;margin:0 auto;padding:48px 16px;line-height:1.5;">${body}</main></body></html>`;
}

export function confirmPage(locale: UnsubLocale, groupName: string, token: string): string {
  const c = COPY[locale];
  return shell(
    locale,
    `<h1 style="font-size:20px;">${escapeHtml(c.confirm(groupName))}</h1><p style="color:#7a7168;">${escapeHtml(c.confirmNote)}</p><form method="post" action="/api/groups/unsubscribe?token=${encodeURIComponent(token)}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="background:#3D5A3E;color:#fff;border:0;padding:12px 20px;border-radius:6px;font-weight:600;font-size:16px;cursor:pointer;">${escapeHtml(c.button)}</button></form>`,
  );
}

export function donePage(locale: UnsubLocale): string {
  return shell(locale, `<h1 style="font-size:20px;">${escapeHtml(COPY[locale].done)}</h1>`);
}

/** The same page for a bad token, a wrong group and an address that is not (or no longer) a member. */
export function invalidPage(locale: UnsubLocale): string {
  return shell(locale, `<h1 style="font-size:20px;">${escapeHtml(COPY[locale].invalid)}</h1>`);
}
