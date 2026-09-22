import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";
import { isGuestAllowedPath, stripLocale } from "@/lib/guestScope";

const intl = createIntlMiddleware(routing);

// Anonymous (QR walk-up) users may only cup / wait / see results. Everything
// else in the shell (coffees, groups, wizard, profile) would let a throwaway
// identity create assets. The proxy is the one place that both sees the
// pathname and already resolved the user, so the gate lives here; server
// layouts do not receive the pathname.
function guestRedirect(request: NextRequest, response: NextResponse): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const localeMatch = /^\/(es|en)(?=\/|$)/.exec(pathname);
  const locale = localeMatch?.[1] ?? routing.defaultLocale;
  const inner = stripLocale(pathname);
  if (!inner.startsWith("/app") || isGuestAllowedPath(inner)) return null;
  const target = new URL(`/${locale}/app/sessions`, request.url);
  const redirect = NextResponse.redirect(target);
  // Keep any refreshed auth cookies the session refresh just set.
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

// Next.js 16 middleware (must be named `proxy` in proxy.ts). Two jobs:
//   1. i18n routing (locale prefix / redirect) — always.
//   2. Supabase session refresh — best effort. This runs before EVERY page,
//      so it must never be the reason the whole site 500s: if the auth
//      service is unreachable we return the intl response unchanged and let
//      the page's own `getUser()` decide (app/[locale]/app/layout.tsx
//      redirects unauthenticated users itself). The only cost of a skipped
//      refresh is that a nearly-expired token isn't renewed on this request.
export async function proxy(request: NextRequest) {
  const response = intl(request) ?? NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Misconfigured deploy: surface it in the logs once per request rather
    // than crashing with a TypeError from the `!` assertions this replaced.
    console.error("[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.is_anonymous) {
      const redirect = guestRedirect(request, response);
      if (redirect) return redirect;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        where: "proxy",
        routePath: request.nextUrl.pathname.replace(/\/[^/]+$/, "/…"),
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return response;
}

// `opengraph-image` is excluded so the file-convention route under [locale]
// is served at its own URL (/es/opengraph-image): with localePrefix
// "as-needed" the intl middleware would otherwise 307 the default-locale
// og:image, and not every link crawler follows redirects on images.
export const config = {
  matcher: [
    "/((?!api|auth/callback|_next/static|_next/image|favicon.ico|.*opengraph-image|.*\\..*).*)",
  ],
};
