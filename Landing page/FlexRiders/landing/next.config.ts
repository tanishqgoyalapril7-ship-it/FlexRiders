import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname),
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // One domain for everything: flexriders.in is this site; /admin (and public /campaign pages) are
  // served by the admin dashboard deployment, and /api/v1 + /uploads by the backend. Each is only
  // forwarded once its address is configured.
  async rewrites() {
    const admin = process.env.ADMIN_APP_URL?.replace(/\/$/, "");
    const api = process.env.BACKEND_URL?.replace(/\/$/, "");
    return [
      ...(admin
        ? [
            { source: "/admin", destination: `${admin}/admin/` },
            { source: "/admin/:path*", destination: `${admin}/admin/:path*` },
            { source: "/campaign/:slug", destination: `${admin}/admin/` },
          ]
        : []),
      ...(api
        ? [
            { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
            { source: "/uploads/:path*", destination: `${api}/uploads/:path*` },
          ]
        : []),
    ];
  },
};

export default nextConfig;
