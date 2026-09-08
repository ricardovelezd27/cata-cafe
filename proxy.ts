import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

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
    await supabase.auth.getUser();
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

export const config = {
  matcher: ["/((?!api|auth/callback|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
