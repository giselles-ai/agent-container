import type { Agent } from "@giselles-ai/sandbox-agent";

/**
 * Parameters for connecting to the Giselle Cloud API.
 */
export type ConnectCloudApiParams = {
	endpoint: string;
	message: string;
	document?: string;
	sessionId?: string;
	sandboxId?: string;
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
 * A live relay subscription that receives relay requests via Redis pub/sub.
 */
export type RelaySubscription = {
	nextRequest: () => Promise<Record<string, unknown>>;
	close: () => Promise<void>;
};

/**
 * Dependency Injection interface for the Giselle provider.
 */
export type GiselleProviderDeps = {
	connectCloudApi: (
		params: ConnectCloudApiParams,
	) => Promise<ConnectCloudApiResult>;
	createRelaySubscription: (params: {
		sessionId: string;
		token: string;
		relayUrl: string;
	}) => RelaySubscription;
	sendRelayResponse: (params: {
		relayUrl: string;
		sessionId: string;
		token: string;
		response: Record<string, unknown>;
	}) => Promise<void>;
};

/**
 * Session metadata persisted in Redis.
 */
export type SessionMetadata = {
	providerSessionId: string;
	geminiSessionId?: string;
	sandboxId?: string;
	relaySessionId?: string;
	relayToken?: string;
	relayUrl?: string;
	pendingRequestId?: string;
	createdAt: number;
};

/**
 * Live connection state stored in the globalThis Map.
 */
export type LiveConnection = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	buffer: string;
	relaySubscription: RelaySubscription | null;
	textBlockOpen: boolean;
};

/**
 * Options for creating the Giselle provider.
 */
export type GiselleProviderOptions = {
	cloudApiUrl: string;
	headers?: Record<string, string>;
	agent: Agent;
	deps?: Partial<GiselleProviderDeps>;
};
