import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({
	apiKey: process.env.GISELLE_SANDBOX_AGENT_API_KEY!,
	cloudApiUrl: process.env.GISELLE_SANDBOX_AGENT_CLOUD_API_URL,
});

export const POST = handler.POST;
