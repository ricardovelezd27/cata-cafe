import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Baseline security headers. Referrer-Policy matters here specifically:
// guest "save my results" claim tokens and invite tokens travel in URLs, and
// strict-origin-when-cross-origin keeps them out of third-party Referer
// headers. No CSP yet — the landing page loads fonts/scripts from several
// origins and a wrong CSP would be an outage; revisit after launch.
const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Inline the (small) global stylesheet instead of a render-blocking
    // request — measurably improves LCP on slow connections.
    inlineCss: true,
  },
  turbopack: {
    // A stray lockfile in a parent directory (C:\Users\ricar\package-lock.json)
    // makes Next.js misinfer the workspace root, breaking node_modules resolution.
    root: path.resolve(__dirname),
  },
  // @react-pdf reads public/fonts/*.ttf from disk at render time (lib/pdf/fonts.ts).
  // Nothing imports them, so the file tracer cannot see them: include them
  // explicitly in every serverless function that renders a PDF — the CVA route,
  // the insights report + digest, the close cron, and the session pages whose
  // server actions (closeSession / resendCloseEmails) call lib/closeEmail.
  // Keys are route globs, values resolve from the project root.
  outputFileTracingIncludes: {
    "/api/sessions/*/cva-pdf": ["./public/fonts/**/*"],
    "/api/sessions/*/participant-summary": ["./public/fonts/**/*"],
    "/api/sessions/*/ficha-tecnica": ["./public/fonts/**/*"],
    "/api/coffees/*/ficha": ["./public/fonts/**/*"],
    "/api/insights/report": ["./public/fonts/**/*"],
    "/api/cron/close-expired-sessions": ["./public/fonts/**/*"],
    "/api/cron/insights-digest": ["./public/fonts/**/*"],
    "/*/app/sessions/**": ["./public/fonts/**/*"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
