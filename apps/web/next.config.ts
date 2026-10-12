import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * npm hoists dependencies to the monorepo root, so file tracing has to start
   * there or the standalone bundle ships without them. This also fixes the
   * bundle's layout: the server lands at `.next/standalone/apps/web/server.js`,
   * which is the path the Dockerfile runs.
   */
  outputFileTracingRoot: path.join(__dirname, "../../"),
  /** Disable powered-by header for security (don't reveal framework) */
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          {
            key: "Content-Type",
            value: "application/json",
          },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
