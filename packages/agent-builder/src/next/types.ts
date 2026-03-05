export type GiselleAgentPluginOptions = {
	/** External API URL. Default: "https://studio.giselles.ai/agent-api/build-api" */
	apiUrl?: string;
	/** Bearer token. Default: process.env.SANDBOX_AGENT_API_KEY */
	token?: string;
	/** Base snapshot ID. Default: process.env.SANDBOX_SNAPSHOT_ID */
	baseSnapshotId?: string;
	/** Additional headers to include in the build API request */
	headers?: Record<string, string | undefined>;
};
