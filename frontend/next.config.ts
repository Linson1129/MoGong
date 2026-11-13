import type { NextConfig } from "next";

// The backend port, mirrored in backend/app/core/config.py. Overridable on both sides, so a
// collision with something else already running locally does not require editing source.
const BACKEND_ORIGIN = process.env.MOGONG_BACKEND_ORIGIN ?? "http://127.0.0.1:8100";

/**
 * `sites` builds the publishable static bundle; anything else builds the development server.
 *
 * The two differ in one respect with consequences everywhere else: a static host has nothing to
 * proxy to. Hence `output: "export"` and no rewrites together -- leaving the rewrite in an exported
 * build is how you ship a 导出 button that quietly 404s, since rewrites are a server feature and the
 * export is a folder of files. The published build reaches the compiler through the browser-side
 * CPython instead; see `src/lib/compile-engine.ts`.
 */
const TARGET = process.env.NEXT_PUBLIC_MOGONG_TARGET === "sites" ? "sites" : "local";
const STATIC_EXPORT = TARGET === "sites";

const nextConfig: NextConfig = {
  /* config options here */
  ...(STATIC_EXPORT ? { output: "export" } : {}),
  // Both of these are streaming-server features, and an export is a folder of files. Cache
  // Components turns partial prefetching on, which is why both flip together: Next fails the build
  // outright on "PPR cannot be enabled in export mode" rather than quietly dropping one of them.
  cacheComponents: !STATIC_EXPORT,
  partialPrefetching: !STATIC_EXPORT,
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
  ...(STATIC_EXPORT
    ? {}
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` }];
        },
      }),
};

export default nextConfig;
