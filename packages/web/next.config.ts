import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@giselles/rpa-sdk", "@giselles/rpa-planner"]
};

export default nextConfig;
