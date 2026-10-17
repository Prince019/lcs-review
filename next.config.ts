import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,   // keep whatever you already have
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/r/laxmi" },
        { source: "/lcsreview", destination: "/r/laxmi" },
      ],
    };
  },
};

export default nextConfig;