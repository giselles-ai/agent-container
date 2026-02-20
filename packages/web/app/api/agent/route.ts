import { handleAgentRunner } from "@giselles-ai/sandbox-agent-core";

export const { POST } = handleAgentRunner({
	// apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY,
	baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL,
});
