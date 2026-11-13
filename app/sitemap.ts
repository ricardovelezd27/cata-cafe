import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/inviteUrl";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";

// The three legal pages (S10 WP9a); listed only once they are published.
const LEGAL_PATHS = ["/privacidad", "/terminos", "/aviso-legal"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteOrigin();

  const legal: MetadataRoute.Sitemap = LEGAL_PAGES_PUBLISHED
    ? LEGAL_PATHS.flatMap((path) =>
        [`${siteUrl}${path}`, `${siteUrl}/en${path}`].map((url) => ({
          url,
          lastModified: new Date(),
          changeFrequency: "yearly" as const,
          priority: 0.3,
          alternates: { languages: { es: `${siteUrl}${path}`, en: `${siteUrl}/en${path}` } },
        })),
      )
    : [];

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          es: siteUrl,
          en: `${siteUrl}/en`,
        },
      },
    },
    {
      url: `${siteUrl}/en`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          es: siteUrl,
          en: `${siteUrl}/en`,
        },
      },
    },
    ...legal,
  ];
}
