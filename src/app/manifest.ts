import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SEMTOP Marketing CRM",
    short_name: "SEMTOP CRM",
    description: "Quản lý lead đa kênh, Marketing Insights và Trợ lý AI thông minh.",
    start_url: "/leads",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f3f5f9",
    theme_color: "#102a6b",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
