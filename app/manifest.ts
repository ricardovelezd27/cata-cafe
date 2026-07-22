import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cata Café",
    short_name: "Cata Café",
    description:
      "Plataforma profesional de catación de café bajo la metodología SCA CVA.",
    start_url: "/",
    display: "standalone",
    background_color: "#FDFBF7",
    theme_color: "#3D5A3E",
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
