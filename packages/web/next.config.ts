import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: [
		"@giselles/browser-tool-sdk",
		"@giselles/browser-tool-planner",
		"@giselles/browser-tool-bridge",
	],
};

export default nextConfig;
