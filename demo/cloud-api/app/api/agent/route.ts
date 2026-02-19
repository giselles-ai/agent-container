import {
	assertBridgeSession,
	BRIDGE_SSE_KEEPALIVE_INTERVAL_MS,
	bridgeRequestChannel,
	createBridgeSession,
	createBridgeSubscriber,
	createGeminiChatHandler,
	dispatchBridgeRequest,
	markBridgeBrowserConnected,
	resolveBridgeResponse,
	toBridgeError,
	touchBridgeBrowserConnected,
} from "@giselles-ai/agent-core";
import {
	bridgeRequestSchema,
	bridgeResponseSchema,
} from "@giselles-ai/browser-tool";
import { z } from "zod";
import { jsonWithCors, preflightResponse, withCors } from "../../../lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[cloud-agent-bridge]";

const agentRunSchema = z.object({
	type: z.literal("agent.run"),
	message: z.string().min(1),
	document: z.string().optional(),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

const dispatchSchema = z.object({
	type: z.literal("bridge.dispatch"),
	sessionId: z.string().min(1),
	token: z.string().min(1),
	request: bridgeRequestSchema,
	timeoutMs: z.number().int().positive().max(55_000).optional(),
});

const respondSchema = z.object({
	type: z.literal("bridge.respond"),
	sessionId: z.string().min(1),
	token: z.string().min(1),
	response: bridgeResponseSchema,
});

const postBodySchema = z.discriminatedUnion("type", [
	agentRunSchema,
	dispatchSchema,
	respondSchema,
]);

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

function notFoundResponse(): Response {
	return jsonWithCors(
		{
			ok: false,
			error: "Not found",
		},
		{ status: 404 },
	);
}

function createSafeError(
	code: string,
	message: string,
	status: number,
): Response {
	return jsonWithCors({ ok: false, errorCode: code, message }, { status });
}

async function createBridgeEventsRoute(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const mode = url.searchParams.get("type") ?? "";
	if (mode !== "bridge.events") {
		return Promise.resolve(notFoundResponse());
	}

	const sessionId = url.searchParams.get("sessionId") ?? "";
	const token = url.searchParams.get("token") ?? "";

	if (!sessionId || !token) {
		return Promise.resolve(
			jsonWithCors(
				{
					errorCode: "UNAUTHORIZED",
					message: "sessionId and token are required.",
				},
				{ status: 401 },
			),
		);
	}

	let cleanup: (() => Promise<void>) | null = null;
	const encoder = new TextEncoder();

	return assertBridgeSession(sessionId, token)
		.then(() => {
			console.info(`${LOG_PREFIX} sse.connect`, { sessionId });
			const requestChannel = bridgeRequestChannel(sessionId);
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					const subscriber = createBridgeSubscriber();
					let keepaliveId: ReturnType<typeof setInterval> | null = null;
					let closed = false;
					let nextEventId = 0;

					const sendSseData = (payload: unknown): void => {
						nextEventId += 1;
						controller.enqueue(
							encoder.encode(
								`id: ${nextEventId}\ndata: ${JSON.stringify(payload)}\n\n`,
							),
						);
					};

					const sendSseRawJson = (rawJson: string): void => {
						nextEventId += 1;
						controller.enqueue(
							encoder.encode(`id: ${nextEventId}\ndata: ${rawJson}\n\n`),
						);
					};

					const sendSseComment = (comment: string): void => {
						controller.enqueue(encoder.encode(`: ${comment}\n\n`));
					};

					const closeController = () => {
						try {
							controller.close();
						} catch {
							// Ignore already closed stream.
						}
					};

					const onAbort = () => {
						void cleanup?.();
						closeController();
					};

					cleanup = async () => {
						if (closed) {
							return;
						}

						closed = true;
						request.signal.removeEventListener("abort", onAbort);

						if (keepaliveId) {
							clearInterval(keepaliveId);
						}

						await subscriber.unsubscribe(requestChannel).catch(() => undefined);
						await subscriber.quit().catch(() => {
							subscriber.disconnect();
						});
					};

					request.signal.addEventListener("abort", onAbort);
					sendSseComment("connected");

					subscriber.on("message", (channel, message) => {
						if (closed || channel !== requestChannel) {
							return;
						}

						try {
							JSON.parse(message);
						} catch {
							return;
						}

						try {
							console.info(`${LOG_PREFIX} sse.push`, { sessionId, message });
							sendSseRawJson(message);
						} catch {
							void cleanup?.();
							closeController();
						}
					});

					subscriber.on("error", (error) => {
						if (closed) {
							return;
						}

						controller.error(error);
						void cleanup?.();
					});

					void (async () => {
						try {
							await subscriber.subscribe(requestChannel);
							await markBridgeBrowserConnected(sessionId, token);
							console.info(`${LOG_PREFIX} sse.ready`, { sessionId });

							sendSseData({ type: "ready", sessionId });

							keepaliveId = setInterval(() => {
								void touchBridgeBrowserConnected(sessionId).catch(
									() => undefined,
								);

								try {
									sendSseComment("keepalive");
								} catch {
									void cleanup?.();
									closeController();
								}
							}, BRIDGE_SSE_KEEPALIVE_INTERVAL_MS);
						} catch (error) {
							if (closed) {
								return;
							}

							controller.error(error);
							await cleanup?.();
						}
					})();
				},
				cancel() {
					void cleanup?.();
				},
			});

			return withCors(
				new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream; charset=utf-8",
						"Cache-Control": "no-cache, no-transform",
						Connection: "keep-alive",
						"X-Accel-Buffering": "no",
						"Content-Encoding": "none",
					},
				}),
			);
		})
		.catch((error) => {
			console.error(`${LOG_PREFIX} sse.error`, {
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
			const bridgeError = toBridgeError(error);
			return jsonWithCors(
				{
					errorCode: bridgeError.code,
					message: bridgeError.message,
				},
				{ status: bridgeError.status },
			);
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

async function handlePost(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = postBodySchema.safeParse(payload);

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

	if (parsed.data.type === "bridge.dispatch") {
		console.info(`${LOG_PREFIX} dispatch.in`, {
			sessionId: parsed.data.sessionId,
			requestId: parsed.data.request.requestId,
			requestType: parsed.data.request.type,
		});
		try {
			const response = await dispatchBridgeRequest({
				sessionId: parsed.data.sessionId,
				token: parsed.data.token,
				request: parsed.data.request,
				timeoutMs: parsed.data.timeoutMs,
			});
			console.info(`${LOG_PREFIX} dispatch.ok`, {
				sessionId: parsed.data.sessionId,
				requestId: parsed.data.request.requestId,
				responseType: response.type,
			});
			return jsonWithCors({ ok: true, response });
		} catch (error) {
			console.error(`${LOG_PREFIX} dispatch.error`, {
				sessionId: parsed.data.sessionId,
				requestId: parsed.data.request.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			const bridgeError = toBridgeError(error);
			return createSafeError(
				bridgeError.code,
				bridgeError.message,
				bridgeError.status,
			);
		}
	}

	if (parsed.data.type === "bridge.respond") {
		console.info(`${LOG_PREFIX} respond.in`, {
			sessionId: parsed.data.sessionId,
			requestId: parsed.data.response.requestId,
			responseType: parsed.data.response.type,
		});
		try {
			await resolveBridgeResponse({
				sessionId: parsed.data.sessionId,
				token: parsed.data.token,
				response: parsed.data.response,
			});
			console.info(`${LOG_PREFIX} respond.ok`, {
				sessionId: parsed.data.sessionId,
				requestId: parsed.data.response.requestId,
			});
			return jsonWithCors({ ok: true });
		} catch (error) {
			console.error(`${LOG_PREFIX} respond.error`, {
				sessionId: parsed.data.sessionId,
				requestId: parsed.data.response.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			const bridgeError = toBridgeError(error);
			return createSafeError(
				bridgeError.code,
				bridgeError.message,
				bridgeError.status,
			);
		}
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
			bridgeUrl: `${cloudApiOrigin}/api/agent`,
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

export async function OPTIONS(): Promise<Response> {
	return preflightResponse();
}

export async function GET(request: Request): Promise<Response> {
	return createBridgeEventsRoute(request);
}

export async function POST(request: Request): Promise<Response> {
	return handlePost(request);
}
