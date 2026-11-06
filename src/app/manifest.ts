import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/leads",
    name: "SEMTOP Marketing CRM",
    short_name: "SEMTOP CRM",
    description: "Quản lý lead đa kênh, Marketing Insights và Trợ lý AI thông minh.",
    start_url: "/leads",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f3f5f9",
    theme_color: "#102a6b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
