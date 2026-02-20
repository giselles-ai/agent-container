import { z } from "zod";
import {
	createGeminiAgent,
	type GeminiAgentRequest,
} from "./agents/gemini-agent";
import {
	type BaseChatRequest,
	type ChatAgent,
	createChatHandler,
} from "./chat-handler";
import { createRelaySession, toRelayError } from "./relay-store";

const DEFAULT_LOG_PREFIX = "[agent-run]";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

export type AgentRunPayload = z.infer<typeof agentRunSchema>;

type RelaySession = Awaited<ReturnType<typeof createRelaySession>>;

export type CreateAgentRunHandlerOptions<TChatRequest extends BaseChatRequest> = {
	payloadSchema: z.ZodType<AgentRunPayload>;
	createAgent(input: {
		request: Request;
		payload: AgentRunPayload;
		relayUrl: string;
	}): ChatAgent<TChatRequest>;
	mapToChatPayload(input: {
		request: Request;
		payload: AgentRunPayload;
		session: RelaySession;
	}): TChatRequest;
	resolveRelayUrl?: (request: Request) => string;
	logPrefix?: string;
};

export type CreateGeminiRunHandlerOptions = {
	snapshotId?: string;
	relayUrl?: string;
	logPrefix?: string;
};

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function resolveDefaultRelayUrl(request: Request): string {
	const configuredRelayUrl = process.env.BROWSER_TOOL_RELAY_URL?.trim();
	if (configuredRelayUrl) {
		return trimTrailingSlash(configuredRelayUrl);
	}

	return `${new URL(request.url).origin}/agent-api/relay`;
}

function toChatRequest<TChatRequest extends BaseChatRequest>(input: {
	request: Request;
	payload: TChatRequest;
}): Request {
	const headers = new Headers(input.request.headers);
	headers.set("content-type", "application/json");

	return new Request(input.request.url, {
		method: "POST",
		headers,
		body: JSON.stringify(input.payload),
		signal: input.request.signal,
	});
}

function mergeRelaySessionStream(input: {
	chatResponse: Response;
	session: RelaySession;
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

export function createAgentRunHandler<TChatRequest extends BaseChatRequest>(
	options: CreateAgentRunHandlerOptions<TChatRequest>,
): { POST: (request: Request) => Promise<Response> } {
	return {
		POST: async (request: Request): Promise<Response> => {
			const payload = await request.json().catch(() => null);
			const parsed = options.payloadSchema.safeParse(payload);

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
				const relayUrl = trimTrailingSlash(
					(options.resolveRelayUrl ?? resolveDefaultRelayUrl)(request),
				);
				if (!relayUrl) {
					throw new Error("Relay URL cannot be empty.");
				}

				const session = await createRelaySession();
				console.info(`${options.logPrefix ?? DEFAULT_LOG_PREFIX} run.session.created`, {
					sessionId: session.sessionId,
				});

				const chatHandler = createChatHandler({
					agent: options.createAgent({
						request,
						payload: parsed.data,
						relayUrl,
					}),
				});
				const chatPayload = options.mapToChatPayload({
					request,
					payload: parsed.data,
					session,
				});
				const chatRequest = toChatRequest({
					request,
					payload: chatPayload,
				});
				const chatResponse = await chatHandler(chatRequest);

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
		},
	};
}

export function createGeminiRunHandler(
	options: CreateGeminiRunHandlerOptions = {},
): { POST: (request: Request) => Promise<Response> } {
	const fixedRelayUrl = options.relayUrl?.trim();

	return createAgentRunHandler<GeminiAgentRequest>({
		payloadSchema: agentRunSchema,
		resolveRelayUrl: fixedRelayUrl
			? () => trimTrailingSlash(fixedRelayUrl)
			: undefined,
		logPrefix: options.logPrefix,
		createAgent({ relayUrl }) {
			return createGeminiAgent({
				snapshotId: options.snapshotId,
				tools: {
					browser: {
						relayUrl,
					},
				},
			});
		},
		mapToChatPayload({ payload, session }) {
			const trimmedDocument = payload.document?.trim();
			const message = trimmedDocument
				? `${payload.message.trim()}\n\nDocument:\n${trimmedDocument}`
				: payload.message.trim();

			return {
				message,
				session_id: payload.session_id,
				sandbox_id: payload.sandbox_id,
				relay_session_id: session.sessionId,
				relay_token: session.token,
			};
		},
	});
}
