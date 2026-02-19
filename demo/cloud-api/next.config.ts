import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@giselles-ai/agent-core", "@giselles-ai/browser-tool"],
};

export default nextConfig;
