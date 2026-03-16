import { basename } from "node:path";
import {
	createRelayHandler,
	createRelaySession,
} from "@giselles-ai/browser-tool/relay";
import { Sandbox } from "@vercel/sandbox";
import type { CreateAgentOptions } from "./agents/create-agent";
import { buildAgent, createSnapshotCache, type SnapshotCache } from "./build";
import { runCloudChat } from "./cloud-chat";
import {
	type CloudChatRunRequest,
	type CloudToolResult,
	cloudChatRunRequestSchema,
} from "./cloud-chat-state";
import {
	type AgentApiStoreConfig,
	resolveCloudChatStateStore,
} from "./cloud-chat-store";
import { createRedisClient } from "./redis";

type BeforeHook = (
	request: Request,
) => Response | undefined | Promise<Response | undefined>;

export type AgentApiOptions = {
	basePath: string;
	store: AgentApiStoreConfig;
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

export type { AgentApiStoreConfig } from "./cloud-chat-store";

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

function createArtifactError(
	status: number,
	path: string,
	message: string,
): Response {
	return errorResponse(status, "FILE_ERROR", `${path}: ${message}`);
}

function getArtifactMimeType(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "md":
			return "text/markdown; charset=utf-8";
		case "json":
			return "application/json; charset=utf-8";
		case "csv":
			return "text/csv; charset=utf-8";
		case "txt":
			return "text/plain; charset=utf-8";
		default:
			return "application/octet-stream";
	}
}

export async function resolveReadableSandbox(input: {
	sandboxId?: string;
	snapshotId?: string;
}): Promise<Sandbox> {
	const createFromSnapshot = async (snapshotId: string) =>
		Sandbox.create({
			source: {
				type: "snapshot",
				snapshotId,
			},
		});

	if (input.sandboxId) {
		try {
			const existing = await Sandbox.get({ sandboxId: input.sandboxId });
			if (existing.status === "running") {
				return existing;
			}

			if (!input.snapshotId) {
				throw new Error(
					`Sandbox ${input.sandboxId} is ${existing.status}, not running`,
				);
			}

			console.log(
				`[agent-api] sandbox=${input.sandboxId} status=${existing.status}, recreating from snapshot=${input.snapshotId}`,
			);
			return createFromSnapshot(input.snapshotId);
		} catch (error) {
			if (!input.snapshotId) {
				throw error;
			}

			console.log(
				`[agent-api] sandbox=${input.sandboxId} expired, recreating from snapshot=${input.snapshotId}`,
			);
			return createFromSnapshot(input.snapshotId);
		}
	}

	if (!input.snapshotId) {
		throw new Error("No sandbox_id or snapshot_id available for file read");
	}

	return createFromSnapshot(input.snapshotId);
}

function createDownloadHeaders(
	path: string,
	options: {
		download?: string | null;
	},
): Record<string, string> {
	const filename = basename(path);
	const mode = options.download === "1" ? "attachment" : "inline";
	return {
		"Content-Type": getArtifactMimeType(path),
		"Content-Disposition": `${mode}; filename="${filename}"`,
		"Cache-Control": "private, no-store",
	};
}

export function createAgentApi(options: AgentApiOptions): {
	GET: (request: Request) => Promise<Response>;
	POST: (request: Request) => Promise<Response>;
	OPTIONS: (request: Request) => Response;
} {
	const relay = createRelayHandler();
	const { basePath, agent: agentOptions } = options;
	let storePromise: Promise<
		import("./cloud-chat-state").CloudChatStateStore
	> | null = null;
	let snapshotCachePromise: Promise<SnapshotCache> | null = null;

	const authPath = `${basePath}/auth`;
	const runPath = `${basePath}/run`;
	const buildPath = `${basePath}/build`;
	const relayPrefix = `${basePath}/relay`;

	function getStore() {
		storePromise ??= resolveCloudChatStateStore(options.store);
		return storePromise;
	}

	function getSnapshotCache() {
		snapshotCachePromise ??= (async () => {
			const redis = await createRedisClient(options.store.url);
			return createSnapshotCache(redis);
		})();
		return snapshotCachePromise;
	}

	async function handleBuild(request: Request): Promise<Response> {
		const baseSnapshotId =
			process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID?.trim() ||
			options.build?.baseSnapshotId;
		if (!options.build && !baseSnapshotId) {
			return errorResponse(404, "NOT_FOUND", "Build endpoint not configured.");
		}
		try {
			const hookResult = await options.hooks?.build?.before?.(request);
			if (hookResult instanceof Response) {
				return hookResult;
			}

			return await buildAgent({
				request,
				baseSnapshotId,
				cache: await getSnapshotCache(),
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

	async function handleFiles(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const chatId = url.searchParams.get("chat_id")?.trim();
		const path = url.searchParams.get("path")?.trim();
		const download = url.searchParams.get("download")?.trim();

		if (!chatId || !path) {
			return createArtifactError(400, "query", "chat_id and path are required");
		}

		if (!path.startsWith("./artifacts/") || path.includes("..")) {
			return createArtifactError(400, "path", "path must be under ./artifacts");
		}

		const store = await getStore();
		const chatState = await store.load(chatId);
		if (!chatState) {
			return createArtifactError(404, "chat_id", "chat session not found");
		}

		let sandbox: Sandbox;
		try {
			sandbox = await resolveReadableSandbox({
				sandboxId: chatState.sandboxId,
				snapshotId: chatState.snapshotId,
			});
		} catch (error) {
			return createArtifactError(
				400,
				"sandbox",
				error instanceof Error ? error.message : "failed to resolve sandbox",
			);
		}

		const fileBuffer = await sandbox.readFileToBuffer({
			path,
		});
		if (!fileBuffer) {
			return createArtifactError(404, "path", "file not found");
		}

		return new Response(new Uint8Array(fileBuffer), {
			headers: createDownloadHeaders(path, { download }),
		});
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
					env: parsed.data.env,
					tool_results: parsed.data.tool_results as
						| CloudToolResult[]
						| undefined,
				},
				agent: {
					...agentOptions,
					type: parsed.data.agent_type,
					snapshotId: parsed.data.snapshot_id,
					env: {
						...parsed.data.env,
						...agentOptions.env,
					},
				},
				signal: request.signal,
				store: await getStore(),
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

	async function handleAuth(request: Request): Promise<Response> {
		try {
			const hookResult = await options.hooks?.build?.before?.(request);
			if (hookResult instanceof Response) {
				return hookResult;
			}
			return Response.json({ ok: true });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Authentication failed.";
			return errorResponse(401, "UNAUTHORIZED", message);
		}
	}

	function matchSubPath(request: Request): string {
		const url = new URL(request.url);
		const pathname = url.pathname;
		const filesPath = `${basePath}/files`;

		if (pathname === authPath || pathname === `${authPath}/`) {
			return "auth";
		}

		if (pathname === runPath || pathname === `${runPath}/`) {
			return "run";
		}

		if (pathname === buildPath || pathname === `${buildPath}/`) {
			return "build";
		}

		if (pathname === filesPath || pathname === `${filesPath}/`) {
			return "files";
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
			if (sub === "files") {
				return handleFiles(request);
			}
			return errorResponse(404, "NOT_FOUND", "Not found.");
		},
		POST: async (request: Request): Promise<Response> => {
			const sub = matchSubPath(request);
			if (sub === "auth") {
				return handleAuth(request);
			}
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
			if (sub === "files") {
				return new Response(null, { status: 204 });
			}
			return new Response(null, { status: 204 });
		},
	};
}
