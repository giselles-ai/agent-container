import {
	createGeminiChatHandler,
	createRelaySession,
	toRelayError,
} from "@giselles-ai/sandbox-agent-core";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[agent-run]";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

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
			relay_session_id: input.session.sessionId,
			relay_token: input.session.token,
		}),
		signal: input.request.signal,
	});
}

function mergeRelaySessionStream(input: {
	chatResponse: Response;
	session: { sessionId: string; token: string; expiresAt: number };
	relayUrl: string;
}): Response {
	if (!input.chatResponse.body) {
		return input.chatResponse;
	}

	const encoder = new TextEncoder();
	const relaySessionEvent = `${JSON.stringify({
		type: "relay.session",
		sessionId: input.session.sessionId,
		token: input.session.token,
		expiresAt: input.session.expiresAt,
		relayUrl: input.relayUrl,
	})}\n`;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(relaySessionEvent));
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

export async function POST(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = agentRunSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
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
		const session = await createRelaySession();
		console.info(`${LOG_PREFIX} run.session.created`, {
			sessionId: session.sessionId,
		});
		const chatRequest = createGeminiRequest({
			request,
			payload: parsed.data,
			session,
		});
		const chatResponse = await chatHandler(chatRequest);
		if (process.env.BROWSER_TOOL_RELAY_URL === undefined) {
			throw new Error("BROWSER_TOOL_RELAY_URL is not defined");
		}
		const relayUrl = process.env.BROWSER_TOOL_RELAY_URL.trim();

		return mergeRelaySessionStream({
			chatResponse,
			session,
			relayUrl,
		});
	} catch (error) {
		const relayError = toRelayError(error);
		return Response.json(
			{ ok: false, errorCode: relayError.code, message: relayError.message },
			{ status: relayError.status },
		);
	}
}
