import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  /**
   * Tắt Streaming Metadata của Next.js 16 (metadata trong app hoàn toàn là hằng số tĩnh, tốn 0ms)
   * để đảm bảo `<link rel="manifest">`, `<link rel="apple-touch-icon">` và `<meta name="apple-mobile-web-app-capable">`
   * luôn nằm trực tiếp trong thẻ `<head>` ngay từ phản hồi HTML đầu tiên cho mọi phiên bản iOS Safari / WebKit.
   */
  htmlLimitedBots: /.*/,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async rewrites() {
    return [
      {
        source: "/manifest.json",
        destination: "/manifest.webmanifest",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
