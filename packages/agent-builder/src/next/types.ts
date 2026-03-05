export type GiselleAgentPluginOptions = {
	/** External API URL. Default: process.env.GISELLE_API_URL ?? "https://studio.giselles.ai" */
	apiUrl?: string;
	/** Bearer token. Default: process.env.EXTERNAL_AGENT_API_BEARER_TOKEN */
	token?: string;
	/** Base snapshot ID. Default: process.env.SANDBOX_SNAPSHOT_ID */
	baseSnapshotId?: string;
	/** Additional headers to include in the build API request */
	headers?: Record<string, string | undefined>;
};
