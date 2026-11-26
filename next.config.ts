import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  // yahoo-finance2 relies on Node built-ins / cookie jar; keep it out of the bundle.
  // @resvg/resvg-js is a native binary (charts of the Telegram Q&A bot): never bundle it.
  serverExternalPackages: ["yahoo-finance2", "@resvg/resvg-js"],
};

export default nextConfig;
