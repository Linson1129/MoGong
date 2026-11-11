import type { NextConfig } from "next";

// The backend port, mirrored in backend/app/core/config.py. Overridable on both sides, so a
// collision with something else already running locally does not require editing source.
const BACKEND_ORIGIN = process.env.MOGONG_BACKEND_ORIGIN ?? "http://127.0.0.1:8100";

const nextConfig: NextConfig = {
  /* config options here */
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
  /**
   * Proxy API calls to the backend instead of calling it cross-origin.
   *
   * The browser then talks to one origin only, so there is no CORS configuration to get wrong and
   * no preflight latency on every save. It also means the frontend can be pointed at a different
   * backend by changing one environment variable.
   */
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
