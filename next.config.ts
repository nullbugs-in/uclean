import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  experimental: {
    // Keep server-only modules out of the client bundle graph.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
