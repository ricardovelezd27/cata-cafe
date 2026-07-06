import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
};

export default withNextIntl(nextConfig);
