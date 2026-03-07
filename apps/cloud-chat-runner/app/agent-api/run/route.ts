import {
	type CloudChatRunRequest,
	type CloudToolResult,
	cloudChatRunRequestSchema,
	runCloudChat,
} from "@giselles-ai/agent-runtime";
import { createRelaySession } from "@giselles-ai/browser-tool/relay";
import {
	extractBearerToken,
	getOptionalEnv,
	MissingServerConfigError,
	verifyApiToken,
} from "../_lib/auth";
import { RedisCloudChatStateStore } from "../_lib/chat-state-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = new RedisCloudChatStateStore();

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

function resolveRelayUrl(request: Request): string {
	const configuredBaseUrl = getOptionalEnv("CLOUD_CHAT_RUNNER_PUBLIC_BASE_URL");
	if (configuredBaseUrl) {
		return new URL(
			"/agent-api/relay",
			`${trimTrailingSlash(configuredBaseUrl)}/`,
		).toString();
	}

	return new URL("/agent-api/relay", request.url).toString();
}

export async function POST(request: Request): Promise<Response> {
	try {
		const token = extractBearerToken(request);
		if (!token) {
			return errorResponse(401, "UNAUTHORIZED", "Missing authorization token.");
		}
		if (!verifyApiToken(token)) {
			return errorResponse(401, "UNAUTHORIZED", "Invalid authorization token.");
		}

		const payload = await request.json().catch(() => null);
		const parsed = cloudChatRunRequestSchema.safeParse(payload);
		if (!parsed.success) {
			return errorResponse(400, "INVALID_REQUEST", "Invalid run request.");
		}

		const relayUrl = resolveRelayUrl(request);

		return await runCloudChat<CloudChatRunRequest>({
			chatId: parsed.data.chat_id,
			request: {
				type: parsed.data.type,
				message: parsed.data.message,
				chat_id: parsed.data.chat_id,
				agent_type: parsed.data.agent_type,
				snapshot_id: parsed.data.snapshot_id,
				tool_results: parsed.data.tool_results as CloudToolResult[] | undefined,
			},
			agent: {
				type: parsed.data.agent_type,
				snapshotId: parsed.data.snapshot_id,
				env: {
					VERCEL_PROTECTION_BYPASS: process.env.VERCEL_PROTECTION_BYPASS,
					GISELLE_PROTECTION_BYPASS: process.env.GISELLE_PROTECTION_BYPASS,
				},
				tools: {
					browser: {
						relayUrl,
					},
				},
			},
			signal: request.signal,
			store,
			relayUrl,
			createRelaySession,
		});
	} catch (error) {
		if (error instanceof MissingServerConfigError) {
			return errorResponse(500, "INTERNAL_ERROR", error.message);
		}

		const message =
			error instanceof Error ? error.message : "Failed to process run request.";
		console.error("POST /agent-api/run failed", error);
		return errorResponse(500, "INTERNAL_ERROR", message);
	}
}
