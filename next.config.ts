import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Inline the (small) global stylesheet instead of a render-blocking
    // request — measurably improves LCP on slow connections.
    inlineCss: true,
  },
};

export default withNextIntl(nextConfig);
