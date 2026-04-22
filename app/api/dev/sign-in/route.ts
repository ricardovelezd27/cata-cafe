import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ALLOWED_EMAILS = new Set(["master@cata.test", "par1@cata.test", "par2@cata.test"]);
const DEV_PASSWORD = "cata-dev-2024";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email") ?? "";
  const next  = searchParams.get("next")  ?? "/es/dev";

  if (!ALLOWED_EMAILS.has(email)) {
    return NextResponse.json({ error: "invalid_test_user" }, { status: 400 });
  }

  // Intermediate response used as a cookie jar by the SSR client
  const cookieJar = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            cookieJar.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });

  if (error) {
    return NextResponse.json(
      { error: "sign_in_failed", detail: error.message },
      { status: 401 },
    );
  }

  const redirectResponse = NextResponse.redirect(`${origin}${next}`);

  // Transfer session cookies from the cookie jar onto the redirect response
  cookieJar.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite as "lax" | "strict" | "none" | undefined,
      secure:   cookie.secure,
      path:     cookie.path,
      maxAge:   cookie.maxAge,
    });
  });

  return redirectResponse;
}
