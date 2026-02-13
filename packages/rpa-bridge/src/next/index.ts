import { bridgeRequestSchema, bridgeResponseSchema } from "@giselles/rpa-sdk";
import { z } from "zod";
import {
	assertBridgeSession,
	BRIDGE_SSE_KEEPALIVE_INTERVAL_MS,
	bridgeRequestChannel,
	createBridgeSession,
	createBridgeSubscriber,
	dispatchBridgeRequest,
	markBridgeBrowserConnected,
	resolveBridgeResponse,
	toBridgeError,
	touchBridgeBrowserConnected,
} from "./bridge-broker";
import { createGeminiChatHandler } from "./chat-handler";

export { createGeminiChatHandler } from "./chat-handler";

export type RouteContext = {
	params?:
		| {
				slug?: string[];
		  }
		| Promise<{ slug?: string[] }>;
};

const dispatchSchema = z.object({
	sessionId: z.string().min(1),
	token: z.string().min(1),
	request: bridgeRequestSchema,
	timeoutMs: z.number().int().positive().max(55_000).optional(),
});

const respondSchema = z.object({
	sessionId: z.string().min(1),
	token: z.string().min(1),
	response: bridgeResponseSchema,
});

function normalizeSlug(raw?: string[]): string[] {
	const slug = Array.isArray(raw) ? raw : [];

	if (slug.length > 0 && slug[0] === "bridge") {
		return slug.slice(1);
	}

	return slug;
}

async function readSlug(context: RouteContext): Promise<string[]> {
	const resolved = await Promise.resolve(context.params).catch(
		() => undefined as { slug?: string[] } | undefined,
	);
	return normalizeSlug(resolved?.slug);
}

function notFoundResponse(): Response {
	return Response.json(
		{
			ok: false,
			error: "Not found",
		},
		{ status: 404 },
	);
}

function createReadmeSafeError(
	code: string,
	message: string,
	status: number,
): Response {
	return Response.json({ ok: false, errorCode: code, message }, { status });
}

async function createSessionRoute(): Promise<Response> {
	const session = await createBridgeSession();

	return Response.json({
		sessionId: session.sessionId,
		token: session.token,
		expiresAt: session.expiresAt,
	});
}

async function createEventsRoute(
	request: Request,
	routeSegments: string[],
): Promise<Response> {
	if (routeSegments.length !== 1) {
		return notFoundResponse();
	}

	const sessionId =
		routeSegments[0] === "events"
			? (new URL(request.url).searchParams.get("sessionId") ?? "")
			: "";
	const token =
		routeSegments[0] === "events"
			? (new URL(request.url).searchParams.get("token") ?? "")
			: "";

	if (!sessionId || !token) {
		return Response.json(
			{
				errorCode: "UNAUTHORIZED",
				message: "sessionId and token are required.",
			},
			{ status: 401 },
		);
	}

	try {
		await assertBridgeSession(sessionId, token);
	} catch (error) {
		const bridgeError = toBridgeError(error);
		return Response.json(
			{
				errorCode: bridgeError.code,
				message: bridgeError.message,
			},
			{ status: bridgeError.status },
		);
	}

	const requestChannel = bridgeRequestChannel(sessionId);
	let cleanup: (() => Promise<void>) | null = null;
	const encoder = new TextEncoder();

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
					// ignore.
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

					sendSseData({
						type: "ready",
						sessionId,
					});

					keepaliveId = setInterval(() => {
						void touchBridgeBrowserConnected(sessionId).catch(() => undefined);

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
		},
	});
}

async function createDispatchRoute(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = dispatchSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				ok: false,
				errorCode: "INVALID_RESPONSE",
				message: "Invalid dispatch payload.",
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	try {
		const response = await dispatchBridgeRequest(parsed.data);
		return Response.json({ ok: true, response });
	} catch (error) {
		const bridgeError = toBridgeError(error);
		return createReadmeSafeError(
			bridgeError.code,
			bridgeError.message,
			bridgeError.status,
		);
	}
}

async function createRespondRoute(request: Request): Promise<Response> {
	const payload = await request.json().catch(() => null);
	const parsed = respondSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				ok: false,
				errorCode: "INVALID_RESPONSE",
				message: "Invalid bridge response payload.",
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	try {
		await resolveBridgeResponse(parsed.data);
		return Response.json({ ok: true });
	} catch (error) {
		const bridgeError = toBridgeError(error);

		return Response.json(
			{
				ok: false,
				errorCode: bridgeError.code,
				message: bridgeError.message,
			},
			{ status: bridgeError.status },
		);
	}
}

export function createBridgeRoutes(): {
	GET: (request: Request, context: RouteContext) => Promise<Response>;
	POST: (request: Request, context: RouteContext) => Promise<Response>;
} {
	const chatHandler = createGeminiChatHandler();

	const getRoute = async (
		request: Request,
		context: RouteContext,
	): Promise<Response> => {
		const slug = await readSlug(context);
		if (slug.length === 0) {
			return notFoundResponse();
		}

		const route = slug[0];
		if (route !== "events") {
			return notFoundResponse();
		}

		return createEventsRoute(request, slug);
	};

	const postRoute = async (
		request: Request,
		context: RouteContext,
	): Promise<Response> => {
		const slug = await readSlug(context);
		if (slug.length === 0) {
			return notFoundResponse();
		}

		const route = slug[0];
		if (route === "session") {
			return createSessionRoute();
		}

		if (route === "dispatch") {
			return createDispatchRoute(request);
		}

		if (route === "respond") {
			return createRespondRoute(request);
		}

		if (route === "chat") {
			return chatHandler(request);
		}

		return notFoundResponse();
	};

	return {
		GET: getRoute,
		POST: postRoute,
	};
}
