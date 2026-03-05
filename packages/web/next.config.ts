import { withGiselleAgent } from "@giselles-ai/agent-builder/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {};

export default withGiselleAgent(nextConfig, agent, {
	apiUrl: process.env.GISELLE_SANDBOX_AGENT_BUILD_URL,
	headers: {
		"x-vercel-protection-bypass":
			process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS,
	},
});
