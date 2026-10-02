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
  // served by the admin dashboard deployment (as is the /brand portal), and /api/v1 + /uploads by the backend. Each is only
  // forwarded once its address is configured.
  // Browser hardening for the website (the /admin, /brand and /campaign pages proxied from the dashboard
  // deployment get the same headers there): never framed, no MIME sniffing, no referrer leaks.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  async rewrites() {
    const admin = process.env.ADMIN_APP_URL?.replace(/\/$/, "");
    const api = process.env.BACKEND_URL?.replace(/\/$/, "");
    return [
      ...(admin
        ? [
            { source: "/admin", destination: `${admin}/admin/` },
            { source: "/admin/:path*", destination: `${admin}/admin/:path*` },
            { source: "/campaign/:slug", destination: `${admin}/admin/` },
            // Brand web portal (campaigns, riders, photos, routes) for brands without the Android app
            { source: "/brand", destination: `${admin}/admin/` },
            { source: "/brand/:path*", destination: `${admin}/admin/` },
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
