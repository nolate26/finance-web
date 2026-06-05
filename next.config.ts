import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  // yahoo-finance2 relies on Node built-ins / cookie jar; keep it out of the bundle.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
