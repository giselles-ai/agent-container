import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: [
		"@giselles-ai/browser-tool",
		"@giselles-ai/sandbox-agent-core",
	],
};

export default nextConfig;
