"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/errors/ErrorPanel";
import "./globals.css";

// Last-resort boundary: replaces the ROOT layout when it (or a locale layout)
// throws, so nothing from next-intl, the fonts, or the app shell exists here.
// It must render its own <html>/<body>, and copy is a hardcoded es/en map
// keyed off the URL prefix (see node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/error.md, "global-error").
const COPY = {
  es: {
    title: "Algo salió mal",
    body: "No pudimos cargar la aplicación. Puedes reintentar o volver al inicio; tu trabajo guardado no se pierde.",
    retry: "Reintentar",
    home: "Ir al inicio",
    support: "Código de soporte",
  },
  en: {
    title: "Something went wrong",
    body: "We could not load the app. You can try again or go back to the dashboard; your saved work is not lost.",
    retry: "Try again",
    home: "Go to dashboard",
    support: "Support code",
  },
} as const;

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry: () => void;
}) {
  const locale =
    typeof window !== "undefined" && window.location.pathname.startsWith("/en")
      ? "en"
      : "es";
  const copy = COPY[locale];

  useEffect(() => {
    console.error("[global-error]", error.message, error.digest ?? "");
  }, [error]);

  return (
    <html lang={locale}>
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <ErrorPanel
            title={copy.title}
            body={copy.body}
            retryLabel={copy.retry}
            onRetry={unstable_retry}
            homeLabel={copy.home}
            homeHref={`/${locale}/app`}
            supportLabel={copy.support}
            digest={error.digest}
          />
        </main>
      </body>
    </html>
  );
}
