import type { NextConfig } from "next";

/**
 * The account API lives on the Node server (apps/server). The browser reaches
 * it through this origin — /api/server/* is proxied there — so the refresh
 * cookie is first-party. Calling the server's own domain directly would make
 * it a third-party cookie, which browsers increasingly refuse to send.
 *
 * API_ORIGIN overrides where it goes. Unset, development uses the local server
 * and a production build uses the deployed one.
 */
const API_ORIGIN = (
  process.env.API_ORIGIN?.trim() ||
  (process.env.NODE_ENV === "production" ? "https://quriosity-1.onrender.com" : "http://localhost:4000")
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/server/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
