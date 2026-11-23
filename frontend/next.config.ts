import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Laravel API, reached by the Next server. The browser never calls it directly:
// /api/* and /sanctum/* are forwarded below, so cookies stay first-party and no CORS is needed.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_INTERNAL_URL}/api/:path*` },
      { source: "/sanctum/:path*", destination: `${API_INTERNAL_URL}/sanctum/:path*` },
      // Medicine photos uploaded in the admin (Laravel public disk).
      { source: "/storage/:path*", destination: `${API_INTERNAL_URL}/storage/:path*` },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
