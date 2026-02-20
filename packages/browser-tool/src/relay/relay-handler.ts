import { z } from "zod";
import { relayRequestSchema, relayResponseSchema } from "../types";
import {
	assertRelaySession,
	createRelaySubscriber,
	dispatchRelayRequest,
	markBrowserConnected,
	RELAY_SSE_KEEPALIVE_INTERVAL_MS,
	relayRequestChannel,
	resolveRelayResponse,
	toRelayError,
	touchBrowserConnected,
} from "./relay-store";

const LOG_PREFIX = "[relay-handler]";

function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("origin");
	return {
		"Access-Control-Allow-Origin": origin || "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Authorization, x-vercel-protection-bypass, x-giselle-protection-bypass",
		"Access-Control-Max-Age": "86400",
	};
}

const dispatchSchema = z.object({
	type: z.literal("relay.dispatch"),
	sessionId: z.string().min(1),
	token: z.string().min(1),
	request: relayRequestSchema,
	timeoutMs: z.number().int().positive().max(55_000).optional(),
});

const respondSchema = z.object({
	type: z.literal("relay.respond"),
	sessionId: z.string().min(1),
	token: z.string().min(1),
	response: relayResponseSchema,
});

const postBodySchema = z.discriminatedUnion("type", [
	dispatchSchema,
	respondSchema,
]);

function createRelayEventsRoute(request: Request): Promise<Response> {
	const cors = corsHeaders(request);
	const url = new URL(request.url);
	const sessionId = url.searchParams.get("sessionId") ?? "";
	const token = url.searchParams.get("token") ?? "";

	if (!sessionId || !token) {
		return Promise.resolve(
			Response.json(
				{
					errorCode: "UNAUTHORIZED",
					message: "sessionId and token are required.",
				},
				{ status: 401, headers: cors },
			),
		);
	}

	let cleanup: (() => Promise<void>) | null = null;
	const encoder = new TextEncoder();

	return assertRelaySession(sessionId, token)
		.then(() => {
			console.info(`${LOG_PREFIX} sse.connect`, { sessionId });
			const requestChannel = relayRequestChannel(sessionId);
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					const subscriber = createRelaySubscriber();
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
							// ignore
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

					subscriber.on("message", (channel: string, message: string) => {
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

					subscriber.on("error", (error: unknown) => {
						if (closed) {
							return;
						}

						controller.error(error);
						void cleanup?.();
					});

					void (async () => {
						try {
							await subscriber.subscribe(requestChannel);
							await markBrowserConnected(sessionId, token);
							console.info(`${LOG_PREFIX} sse.ready`, { sessionId });

							sendSseData({ type: "ready", sessionId });

							keepaliveId = setInterval(() => {
								void touchBrowserConnected(sessionId).catch(() => undefined);

								try {
									sendSseComment("keepalive");
								} catch {
									void cleanup?.();
									closeController();
								}
							}, RELAY_SSE_KEEPALIVE_INTERVAL_MS);
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

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream; charset=utf-8",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
					"Content-Encoding": "none",
					...cors,
				},
			});
		})
		.catch((error) => {
			console.error(`${LOG_PREFIX} sse.error`, {
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
			const relayError = toRelayError(error);
			return Response.json(
				{
					errorCode: relayError.code,
					message: relayError.message,
				},
				{ status: relayError.status, headers: cors },
			);
		});
}

async function createRelayPostRoute(request: Request): Promise<Response> {
	const cors = corsHeaders(request);
	const payload = await request.json().catch(() => null);
	const parsed = postBodySchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				ok: false,
				errorCode: "INVALID_RESPONSE",
				message: "Invalid request payload.",
			},
			{ status: 400, headers: cors },
		);
	}

	if (parsed.data.type === "relay.dispatch") {
		try {
			const response = await dispatchRelayRequest({
				sessionId: parsed.data.sessionId,
				token: parsed.data.token,
				request: parsed.data.request,
				timeoutMs: parsed.data.timeoutMs,
			});
			return Response.json({ ok: true, response }, { headers: cors });
		} catch (error) {
			const relayError = toRelayError(error);
			return Response.json(
				{ ok: false, errorCode: relayError.code, message: relayError.message },
				{ status: relayError.status, headers: cors },
			);
		}
	}

	try {
		await resolveRelayResponse({
			sessionId: parsed.data.sessionId,
			token: parsed.data.token,
			response: parsed.data.response,
		});
		return Response.json({ ok: true }, { headers: cors });
	} catch (error) {
		const relayError = toRelayError(error);
		return Response.json(
			{ ok: false, errorCode: relayError.code, message: relayError.message },
			{ status: relayError.status, headers: cors },
		);
	}
}

export function createRelayHandler(): {
	GET: (request: Request) => Promise<Response>;
	POST: (request: Request) => Promise<Response>;
	OPTIONS: (request: Request) => Response;
} {
	return {
		GET: async (request: Request): Promise<Response> =>
			createRelayEventsRoute(request),
		POST: createRelayPostRoute,
		OPTIONS: (request: Request): Response =>
			new Response(null, { status: 204, headers: corsHeaders(request) }),
	};
}
