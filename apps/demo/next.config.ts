import { withGiselleAgent } from "@giselles-ai/agent/next";
import type { NextConfig } from "next";
import { agent } from "./lib/agent";

const nextConfig: NextConfig = {};

export default withGiselleAgent(nextConfig, agent, {
	baseUrl: process.env.GISELLE_AGENT_BASE_URL,
	headers: {
		"x-vercel-protection-bypass":
			process.env.EXTERNAL_AGENT_API_PROTECTION_BYPASS,
	},
});
