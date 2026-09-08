import Link from "next/link";

// Root not-found — only fires when the URL's first segment isn't a known
// locale (the notFound() call in app/[locale]/layout.tsx when hasLocale()
// fails). next-intl isn't available at this level, so copy is hardcoded
// bilingually (es first, per the project's default locale, then en). This
// renders INSIDE the root layout's existing <html>/<body> (app/layout.tsx) —
// it must not declare its own, unlike global-not-found.
export default function RootNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-6 rounded-card border border-outline-variant bg-surface-container p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Página no encontrada</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            El enlace puede estar mal escrito o el contenido ya no existe.
          </p>
          <Link href="/es/app" className="mt-3 inline-block text-sm font-medium text-primary-container underline">
            Ir al inicio
          </Link>
        </div>
        <div className="border-t border-outline-variant pt-4">
          <h2 className="text-xl font-semibold text-on-surface">Page not found</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            The link may be mistyped, or the content no longer exists.
          </p>
          <Link href="/en/app" className="mt-3 inline-block text-sm font-medium text-primary-container underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
