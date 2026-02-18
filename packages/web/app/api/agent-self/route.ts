import { handleAgentRunner } from "@giselles-ai/agent";

export const { POST } = handleAgentRunner({
	baseUrl: process.env.GISELLE_SANDBOX_AGENT_BASE_URL,
});
