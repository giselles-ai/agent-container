import {
	createBridgeSession,
	createGeminiChatHandler,
	toBridgeError,
} from "@giselles-ai/sandbox-agent-core";
import { z } from "zod";
import { jsonWithCors, preflightResponse, withCors } from "../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[cloud-agent-run]";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function resolveCloudApiOrigin(request: Request): string {
	const configuredOrigin = process.env.CLOUD_API_ORIGIN?.trim();
	if (configuredOrigin) {
		return trimTrailingSlash(configuredOrigin);
	}

	return new URL(request.url).origin;
}

function createGeminiRequest(input: {
	request: Request;
	payload: z.infer<typeof agentRunSchema>;
	session: { sessionId: string; token: string };
}): Request {
	const headers = new Headers(input.request.headers);
	headers.set("content-type", "application/json");

	const trimmedDocument = input.payload.document?.trim();
	const message = trimmedDocument
		? `${input.payload.message.trim()}\n\nDocument:\n${trimmedDocument}`
		: input.payload.message.trim();

	return new Request(input.request.url, {
		method: "POST",
		headers,
		body: JSON.stringify({
			message,
			session_id: input.payload.session_id,
			sandbox_id: input.payload.sandbox_id,
			bridge_session_id: input.session.sessionId,
			bridge_token: input.session.token,
		}),
		signal: input.request.signal,
	});
}

function mergeBridgeSessionStream(input: {
	chatResponse: Response;
	session: { sessionId: string; token: string; expiresAt: number };
	bridgeUrl: string;
}): Response {
	if (!input.chatResponse.body) {
		return input.chatResponse;
	}

	const encoder = new TextEncoder();
	const bridgeSessionEvent = `${JSON.stringify({
		type: "bridge.session",
		sessionId: input.session.sessionId,
		token: input.session.token,
		expiresAt: input.session.expiresAt,
		bridgeUrl: input.bridgeUrl,
	})}\n`;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(bridgeSessionEvent));
			const reader = input.chatResponse.body?.getReader();
			if (!reader) {
				controller.close();
				return;
			}

			void (async () => {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							break;
						}
						controller.enqueue(value);
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					reader.releaseLock();
				}
			})();
		},
	});

	const headers = new Headers(input.chatResponse.headers);
	headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
	headers.set("Cache-Control", "no-cache, no-transform");

	return new Response(stream, {
		status: input.chatResponse.status,
		statusText: input.chatResponse.statusText,
		headers,
	});
}

function createSafeError(
	code: string,
	message: string,
	status: number,
): Response {
	return jsonWithCors({ ok: false, errorCode: code, message }, { status });
}

export async function OPTIONS(): Promise<Response> {
	return preflightResponse();
}

export async function POST(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = agentRunSchema.safeParse(payload);

	if (!parsed.success) {
		return jsonWithCors(
			{
				ok: false,
				errorCode: "INVALID_RESPONSE",
				message: "Invalid request payload.",
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	try {
		const chatHandler = createGeminiChatHandler();
		const session = await createBridgeSession();
		console.info(`${LOG_PREFIX} run.session.created`, {
			sessionId: session.sessionId,
		});
		const chatRequest = createGeminiRequest({
			request,
			payload: parsed.data,
			session,
		});
		const chatResponse = await chatHandler(chatRequest);
		const cloudApiOrigin = resolveCloudApiOrigin(request);

		const response = mergeBridgeSessionStream({
			chatResponse,
			session,
			bridgeUrl: `${cloudApiOrigin}/agent-api/bridge`,
		});
		return withCors(response);
	} catch (error) {
		const bridgeError = toBridgeError(error);
		return createSafeError(
			bridgeError.code,
			bridgeError.message,
			bridgeError.status,
		);
	}
}
