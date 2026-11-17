import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Café Sensible",
    short_name: "Café Sensible",
    description:
      "Plataforma profesional de catación de café bajo la metodología SCA CVA.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8f6", // --color-surface (tests/hexScan.test.ts)
    theme_color: "#2c4c3b", // --color-primary-container
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
