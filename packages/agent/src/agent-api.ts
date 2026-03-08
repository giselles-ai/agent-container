import {
	createRelayHandler,
	createRelaySession,
} from "@giselles-ai/browser-tool/relay";
import type { CreateAgentOptions } from "./agents/create-agent";
import { buildAgent } from "./build";
import { runCloudChat } from "./cloud-chat";
import {
	type CloudChatRunRequest,
	type CloudChatStateStore,
	type CloudToolResult,
	cloudChatRunRequestSchema,
} from "./cloud-chat-state";

type BeforeHook = (
	request: Request,
) => Response | undefined | Promise<Response | undefined>;

export type AgentApiOptions = {
	basePath: string;
	store: CloudChatStateStore;
	agent: Omit<CreateAgentOptions, "type" | "snapshotId">;
	build?: {
		baseSnapshotId?: string;
	};
	hooks?: {
		chat?: {
			before?: BeforeHook;
		};
		build?: {
			before?: BeforeHook;
		};
	};
};

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function errorResponse(
	status: number,
	errorCode: string,
	message: string,
): Response {
	return Response.json(
		{
			ok: false,
			errorCode,
			message,
		},
		{ status },
	);
}

function resolveRelayUrl(basePath: string, request: Request): string {
	const configuredBaseUrl = process.env.GISELLE_AGENT_RELAY_URL?.trim();
	if (configuredBaseUrl) {
		return new URL(
			`${basePath}/relay`,
			`${trimTrailingSlash(configuredBaseUrl)}/`,
		).toString();
	}

	return new URL(`${basePath}/relay`, request.url).toString();
}

export function createAgentApi(options: AgentApiOptions): {
	GET: (request: Request) => Promise<Response>;
	POST: (request: Request) => Promise<Response>;
	OPTIONS: (request: Request) => Response;
} {
	const relay = createRelayHandler();
	const { basePath, store, agent: agentOptions } = options;

	const runPath = `${basePath}/run`;
	const buildPath = `${basePath}/build`;
	const relayPrefix = `${basePath}/relay`;

	async function handleBuild(request: Request): Promise<Response> {
		if (!options.build) {
			return errorResponse(404, "NOT_FOUND", "Build endpoint not configured.");
		}
		try {
			const hookResult = await options.hooks?.build?.before?.(request);
			if (hookResult instanceof Response) {
				return hookResult;
			}

			return await buildAgent({
				request,
				baseSnapshotId: options.build.baseSnapshotId,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to process build request.";
			console.error(`POST ${buildPath} failed`, error);
			return errorResponse(500, "INTERNAL_ERROR", message);
		}
	}

	async function handleRun(request: Request): Promise<Response> {
		try {
			const hookResult = await options.hooks?.chat?.before?.(request);
			if (hookResult instanceof Response) {
				return hookResult;
			}

			const payload = await request.json().catch(() => null);
			const parsed = cloudChatRunRequestSchema.safeParse(payload);
			if (!parsed.success) {
				return errorResponse(400, "INVALID_REQUEST", "Invalid run request.");
			}

			const relayUrl = resolveRelayUrl(basePath, request);

			return await runCloudChat<CloudChatRunRequest>({
				chatId: parsed.data.chat_id,
				request: {
					type: parsed.data.type,
					message: parsed.data.message,
					chat_id: parsed.data.chat_id,
					agent_type: parsed.data.agent_type,
					snapshot_id: parsed.data.snapshot_id,
					tool_results: parsed.data.tool_results as
						| CloudToolResult[]
						| undefined,
				},
				agent: {
					...agentOptions,
					type: parsed.data.agent_type,
					snapshotId: parsed.data.snapshot_id,
				},
				signal: request.signal,
				store,
				relayUrl,
				createRelaySession,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to process run request.";
			console.error(`POST ${runPath} failed`, error);
			return errorResponse(500, "INTERNAL_ERROR", message);
		}
	}

	function matchSubPath(request: Request): string {
		const url = new URL(request.url);
		const pathname = url.pathname;

		if (pathname === runPath || pathname === `${runPath}/`) {
			return "run";
		}

		if (pathname === buildPath || pathname === `${buildPath}/`) {
			return "build";
		}

		if (pathname === relayPrefix || pathname.startsWith(`${relayPrefix}/`)) {
			return "relay";
		}

		return "unknown";
	}

	return {
		GET: async (request: Request): Promise<Response> => {
			const sub = matchSubPath(request);
			if (sub === "relay") {
				return relay.GET(request);
			}
			return errorResponse(404, "NOT_FOUND", "Not found.");
		},
		POST: async (request: Request): Promise<Response> => {
			const sub = matchSubPath(request);
			if (sub === "run") {
				return handleRun(request);
			}
			if (sub === "build") {
				return handleBuild(request);
			}
			if (sub === "relay") {
				return relay.POST(request);
			}
			return errorResponse(404, "NOT_FOUND", "Not found.");
		},
		OPTIONS: (request: Request): Response => {
			const sub = matchSubPath(request);
			if (sub === "relay") {
				return relay.OPTIONS(request);
			}
			return new Response(null, { status: 204 });
		},
	};
}
