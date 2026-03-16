import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {
	reactCompiler: true,
};

export default withGiselleAgent(nextConfig, agent, {
	headers: {
		"x-vercel-protection-bypass":
			process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS,
	},
});
