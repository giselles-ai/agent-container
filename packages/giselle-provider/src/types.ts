/**
 * Parameters for connecting to the Giselle Cloud API.
 */
export type CloudToolResult = {
	toolCallId: string;
	toolName: string;
	output: unknown;
};

export type ConnectCloudApiParams = {
	endpoint: string;
	chatId: string;
	message: string;
	document?: string;
	toolResults?: CloudToolResult[];
	agentType?: string;
	snapshotId?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

/**
 * Result of connecting to the Cloud API.
 */
export type ConnectCloudApiResult = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	response: Response;
};

/**
 * Dependency Injection interface for the Giselle provider.
 */
export type GiselleProviderDeps = {
	connectCloudApi: (
		params: ConnectCloudApiParams,
	) => Promise<ConnectCloudApiResult>;
};

/**
 * Minimal agent reference for the provider.
 */
export type AgentRef = {
	readonly type?: string;
	readonly agentType?: string;
	readonly snapshotId: string;
};

/**
 * Options for creating the Giselle provider.
 */
export type GiselleProviderOptions = {
	baseUrl?: string;
	apiKey?: string;
	headers?: Record<string, string | undefined>;
	agent: AgentRef;
	deps?: Partial<GiselleProviderDeps>;
	snapshot?: {
		onCreated?: (snapshotId: string) => void | Promise<void>;
	};
};
