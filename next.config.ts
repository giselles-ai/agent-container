import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	serverExternalPackages: ["bash-tool", "just-bash", "@mongodb-js/zstd"],
};

export default nextConfig;
