import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/inviteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteOrigin();

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
  ];
}
