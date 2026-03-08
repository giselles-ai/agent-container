export type GiselleAgentPluginOptions = {
	/** Base URL for the agent API. Default: process.env.GISELLE_AGENT_BASE_URL ?? "https://studio.giselles.ai/agent-api" */
	baseUrl?: string;
	/** Bearer token. Default: process.env.GISELLE_AGENT_API_KEY */
	token?: string;
	/** Additional headers to include in the build API request */
	headers?: Record<string, string | undefined>;
};
