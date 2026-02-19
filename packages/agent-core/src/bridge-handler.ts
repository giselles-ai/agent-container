import {
	bridgeRequestSchema,
	bridgeResponseSchema,
} from "@giselles-ai/browser-tool";
import { z } from "zod";
import {
	assertBridgeSession,
	BRIDGE_SSE_KEEPALIVE_INTERVAL_MS,
	bridgeRequestChannel,
	createBridgeSubscriber,
	dispatchBridgeRequest,
	markBridgeBrowserConnected,
	resolveBridgeResponse,
	toBridgeError,
	touchBridgeBrowserConnected,
} from "./bridge-broker";

const LOG_PREFIX = "[bridge-handler]";

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
	dispatchSchema,
	respondSchema,
]);

function createSafeError(
	code: string,
	message: string,
	status: number,
): Response {
	return Response.json({ ok: false, errorCode: code, message }, { status });
}

function createBridgeEventsRoute(request: Request): Promise<Response> {
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

			return new Response(stream, {
				headers: {
					"Content-Type": "text/event-stream; charset=utf-8",
					"Cache-Control": "no-cache, no-transform",
					Connection: "keep-alive",
					"X-Accel-Buffering": "no",
					"Content-Encoding": "none",
				},
			});
		})
		.catch((error) => {
			console.error(`${LOG_PREFIX} sse.error`, {
				sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
			const bridgeError = toBridgeError(error);
			return Response.json(
				{
					errorCode: bridgeError.code,
					message: bridgeError.message,
				},
				{ status: bridgeError.status },
			);
		});
}

async function createBridgePostRoute(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = postBodySchema.safeParse(payload);

	if (!parsed.success) {
		return createSafeError("INVALID_RESPONSE", "Invalid request payload.", 400);
	}

	if (parsed.data.type === "bridge.dispatch") {
		try {
			const response = await dispatchBridgeRequest({
				sessionId: parsed.data.sessionId,
				token: parsed.data.token,
				request: parsed.data.request,
				timeoutMs: parsed.data.timeoutMs,
			});
			return Response.json({ ok: true, response });
		} catch (error) {
			const bridgeError = toBridgeError(error);
			return createSafeError(
				bridgeError.code,
				bridgeError.message,
				bridgeError.status,
			);
		}
	}

	try {
		await resolveBridgeResponse({
			sessionId: parsed.data.sessionId,
			token: parsed.data.token,
			response: parsed.data.response,
		});
		return Response.json({ ok: true });
	} catch (error) {
		const bridgeError = toBridgeError(error);
		return createSafeError(
			bridgeError.code,
			bridgeError.message,
			bridgeError.status,
		);
	}
}

export function createBridgeHandler(): {
	GET: (request: Request) => Promise<Response>;
	POST: (request: Request) => Promise<Response>;
} {
	return {
		GET: async (request: Request): Promise<Response> =>
			createBridgeEventsRoute(request),
		POST: createBridgePostRoute,
	};
}
