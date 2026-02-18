import { createAgentApiHandler } from "@giselles-ai/agent-self";

export const { GET, POST } = createAgentApiHandler({
	baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL,
});
