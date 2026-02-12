import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@giselles/rpa-sdk", "@giselles/rpa-planner", "@giselles/rpa-bridge"]
};

export default nextConfig;
