import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Disable powered-by header for security (don't reveal framework) */
  poweredByHeader: false,
};

export default nextConfig;
