import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/inviteUrl";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = siteOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
