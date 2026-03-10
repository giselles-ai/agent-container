import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
};

export default withGiselleAgent(nextConfig, agent);
