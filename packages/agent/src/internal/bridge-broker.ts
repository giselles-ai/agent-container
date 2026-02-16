import { randomUUID } from "node:crypto";
import {
	type BridgeErrorCode,
	type BridgeRequest,
	type BridgeResponse,
	bridgeResponseSchema,
} from "@giselles-ai/browser-tool";
import Redis from "ioredis";

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REQUEST_TTL_SEC = 60;
const DEFAULT_DISPATCH_TIMEOUT_MS = 20 * 1000;
const BROWSER_PRESENCE_TTL_SEC = 90;
export const BRIDGE_SSE_KEEPALIVE_INTERVAL_MS = 20 * 1000;

const REDIS_URL_ENV_CANDIDATES = [
	"REDIS_URL",
	"REDIS_TLS_URL",
	"KV_URL",
	"UPSTASH_REDIS_TLS_URL",
	"UPSTASH_REDIS_URL",
] as const;
const BRIDGE_SUBSCRIBER_REDIS_OPTIONS = {
	enableReadyCheck: false,
	autoResubscribe: false,
	autoResendUnfulfilledCommands: false,
	maxRetriesPerRequest: 2,
} as const;

type BridgeSessionRecord = {
	token: string;
	expiresAt: number;
};

declare global {
	var __geminiRpaBridgeRedis: Redis | undefined;
}

export class BridgeBrokerError extends Error {
	readonly code: BridgeErrorCode;
	readonly status: number;

	constructor(code: BridgeErrorCode, message: string, status: number) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

function createBridgeError(
	code: BridgeErrorCode,
	message: string,
): BridgeBrokerError {
	switch (code) {
		case "UNAUTHORIZED":
			return new BridgeBrokerError(code, message, 401);
		case "NO_BROWSER":
			return new BridgeBrokerError(code, message, 409);
		case "TIMEOUT":
			return new BridgeBrokerError(code, message, 408);
		case "INVALID_RESPONSE":
			return new BridgeBrokerError(code, message, 422);
		case "NOT_FOUND":
			return new BridgeBrokerError(code, message, 404);
		case "INTERNAL":
			return new BridgeBrokerError(code, message, 500);
		default:
			return new BridgeBrokerError("INTERNAL", message, 500);
	}
}

function resolveRedisUrl(): string {
	for (const name of REDIS_URL_ENV_CANDIDATES) {
		const value = process.env[name]?.trim();
		if (value) {
			return value;
		}
	}

	throw createBridgeError(
		"INTERNAL",
		`Missing Redis URL. Set one of: ${REDIS_URL_ENV_CANDIDATES.join(", ")}`,
	);
}

function getRedisClient(): Redis {
	if (!globalThis.__geminiRpaBridgeRedis) {
		globalThis.__geminiRpaBridgeRedis = new Redis(resolveRedisUrl(), {
			maxRetriesPerRequest: 2,
		});
	}

	return globalThis.__geminiRpaBridgeRedis;
}

export function createBridgeSubscriber(): Redis {
	return getRedisClient().duplicate(BRIDGE_SUBSCRIBER_REDIS_OPTIONS);
}

function sessionKey(sessionId: string): string {
	return `bridge:session:${sessionId}`;
}

function browserPresenceKey(sessionId: string): string {
	return `bridge:browser:${sessionId}`;
}

function requestTypeKey(sessionId: string, requestId: string): string {
	return `bridge:req:${sessionId}:${requestId}:type`;
}

function responseKey(sessionId: string, requestId: string): string {
	return `bridge:resp:${sessionId}:${requestId}`;
}

export function bridgeRequestChannel(sessionId: string): string {
	return `bridge:${sessionId}:request`;
}

function bridgeResponseChannel(sessionId: string, requestId: string): string {
	return `bridge:${sessionId}:response:${requestId}`;
}

function sessionExpiryTimestamp(): number {
	return Date.now() + DEFAULT_SESSION_TTL_MS;
}

function parseSessionRecord(raw: string): BridgeSessionRecord {
	let parsed: unknown = null;

	try {
		parsed = JSON.parse(raw);
	} catch {
		throw createBridgeError(
			"INTERNAL",
			"Bridge session payload in Redis is malformed.",
		);
	}

	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("token" in parsed) ||
		!("expiresAt" in parsed) ||
		typeof parsed.token !== "string" ||
		typeof parsed.expiresAt !== "number"
	) {
		throw createBridgeError(
			"INTERNAL",
			"Bridge session payload in Redis is invalid.",
		);
	}

	return {
		token: parsed.token,
		expiresAt: parsed.expiresAt,
	};
}

function toRequestType(value: string): BridgeRequest["type"] {
	if (value === "snapshot_request" || value === "execute_request") {
		return value;
	}

	throw createBridgeError(
		"INTERNAL",
		`Stored request type is invalid: ${value}`,
	);
}

function parseStoredBridgeResponse(raw: string): BridgeResponse {
	let decoded: unknown = null;

	try {
		decoded = JSON.parse(raw);
	} catch {
		throw createBridgeError(
			"INVALID_RESPONSE",
			"Bridge response payload in Redis is malformed.",
		);
	}

	const parsed = bridgeResponseSchema.safeParse(decoded);
	if (!parsed.success) {
		throw createBridgeError(
			"INVALID_RESPONSE",
			"Bridge response payload in Redis is invalid.",
		);
	}

	return parsed.data;
}

async function touchSession(sessionId: string, token: string): Promise<number> {
	const expiresAt = sessionExpiryTimestamp();
	const redis = getRedisClient();

	await redis.set(
		sessionKey(sessionId),
		JSON.stringify({ token, expiresAt }),
		"EX",
		Math.ceil(DEFAULT_SESSION_TTL_MS / 1000),
	);
	return expiresAt;
}

async function getAuthorizedSession(
	sessionId: string,
	token: string,
): Promise<BridgeSessionRecord> {
	const redis = getRedisClient();
	const raw = await redis.get(sessionKey(sessionId));

	if (!raw) {
		throw createBridgeError(
			"UNAUTHORIZED",
			"Invalid bridge session credentials.",
		);
	}

	const session = parseSessionRecord(raw);
	if (session.token !== token) {
		throw createBridgeError(
			"UNAUTHORIZED",
			"Invalid bridge session credentials.",
		);
	}

	const expiresAt = await touchSession(sessionId, token);
	return {
		token,
		expiresAt,
	};
}

function validateResponseType(
	requestType: BridgeRequest["type"],
	responseType: BridgeResponse["type"],
): void {
	if (
		requestType === "snapshot_request" &&
		responseType !== "snapshot_response"
	) {
		throw createBridgeError(
			"INVALID_RESPONSE",
			`Expected snapshot_response, but received ${responseType}.`,
		);
	}

	if (
		requestType === "execute_request" &&
		responseType !== "execute_response"
	) {
		throw createBridgeError(
			"INVALID_RESPONSE",
			`Expected execute_response, but received ${responseType}.`,
		);
	}
}

async function ensureBrowserConnected(sessionId: string): Promise<void> {
	const redis = getRedisClient();
	const isConnected = await redis.exists(browserPresenceKey(sessionId));

	if (isConnected === 0) {
		throw createBridgeError(
			"NO_BROWSER",
			"No browser client is connected to this bridge session.",
		);
	}
}

async function waitForBridgeResponseSignal(input: {
	subscriber: Redis;
	channel: string;
	timeoutMs: number;
	trigger: () => Promise<void>;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let settled = false;

		const onMessage = (channel: string) => {
			if (settled || channel !== input.channel) {
				return;
			}

			settled = true;
			cleanup();
			resolve();
		};

		const onError = (error: unknown) => {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			const message =
				error instanceof Error
					? error.message
					: "Unknown Redis subscriber error.";
			reject(
				createBridgeError(
					"INTERNAL",
					`Redis subscriber failed while waiting for response. ${message}`,
				),
			);
		};

		const onTimeout = () => {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			reject(
				createBridgeError(
					"TIMEOUT",
					"Timed out waiting for browser bridge response.",
				),
			);
		};

		const timeoutId = setTimeout(onTimeout, input.timeoutMs);

		const cleanup = () => {
			clearTimeout(timeoutId);
			input.subscriber.off("message", onMessage);
			input.subscriber.off("error", onError);
		};

		input.subscriber.on("message", onMessage);
		input.subscriber.on("error", onError);

		void input.trigger().catch((error: unknown) => {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();

			if (error instanceof BridgeBrokerError) {
				reject(error);
				return;
			}

			const message =
				error instanceof Error ? error.message : "Unknown Redis publish error.";
			reject(
				createBridgeError(
					"INTERNAL",
					`Failed to publish bridge request. ${message}`,
				),
			);
		});
	});
}

async function storeBridgeResponse(input: {
	sessionId: string;
	requestId: string;
	response: BridgeResponse;
}): Promise<void> {
	const redis = getRedisClient();

	await redis
		.multi()
		.set(
			responseKey(input.sessionId, input.requestId),
			JSON.stringify(input.response),
			"EX",
			DEFAULT_REQUEST_TTL_SEC,
		)
		.del(requestTypeKey(input.sessionId, input.requestId))
		.publish(
			bridgeResponseChannel(input.sessionId, input.requestId),
			input.requestId,
		)
		.exec();
}

export async function createBridgeSession(): Promise<{
	sessionId: string;
	token: string;
	expiresAt: number;
}> {
	const sessionId = randomUUID();
	const token = `${randomUUID()}-${randomUUID()}`;
	const expiresAt = sessionExpiryTimestamp();
	const redis = getRedisClient();

	await redis.set(
		sessionKey(sessionId),
		JSON.stringify({
			token,
			expiresAt,
		}),
		"EX",
		Math.ceil(DEFAULT_SESSION_TTL_MS / 1000),
	);

	return {
		sessionId,
		token,
		expiresAt,
	};
}

export async function assertBridgeSession(
	sessionId: string,
	token: string,
): Promise<void> {
	await getAuthorizedSession(sessionId, token);
}

export async function markBridgeBrowserConnected(
	sessionId: string,
	token: string,
): Promise<void> {
	await getAuthorizedSession(sessionId, token);

	const redis = getRedisClient();
	await redis.set(
		browserPresenceKey(sessionId),
		"1",
		"EX",
		BROWSER_PRESENCE_TTL_SEC,
	);
}

export async function touchBridgeBrowserConnected(
	sessionId: string,
): Promise<void> {
	const redis = getRedisClient();
	await redis.set(
		browserPresenceKey(sessionId),
		"1",
		"EX",
		BROWSER_PRESENCE_TTL_SEC,
	);
}

export async function dispatchBridgeRequest(input: {
	sessionId: string;
	token: string;
	request: BridgeRequest;
	timeoutMs?: number;
}): Promise<BridgeResponse> {
	await getAuthorizedSession(input.sessionId, input.token);
	await ensureBrowserConnected(input.sessionId);

	const redis = getRedisClient();
	const timeoutMs = input.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
	const requestId = input.request.requestId;
	const requestTypeStateKey = requestTypeKey(input.sessionId, requestId);
	const storedResponseKey = responseKey(input.sessionId, requestId);
	const responseEventChannel = bridgeResponseChannel(
		input.sessionId,
		requestId,
	);
	const subscriber = createBridgeSubscriber();

	const setPending = await redis.set(
		requestTypeStateKey,
		input.request.type,
		"EX",
		DEFAULT_REQUEST_TTL_SEC,
		"NX",
	);

	if (setPending !== "OK") {
		throw createBridgeError(
			"INVALID_RESPONSE",
			`Request id is already pending: ${requestId}`,
		);
	}

	try {
		await redis.del(storedResponseKey);
		await subscriber.subscribe(responseEventChannel);

		await waitForBridgeResponseSignal({
			subscriber,
			channel: responseEventChannel,
			timeoutMs,
			trigger: async () => {
				await redis.publish(
					bridgeRequestChannel(input.sessionId),
					JSON.stringify(input.request),
				);
			},
		});

		const storedResponse = await redis.get(storedResponseKey);
		if (!storedResponse) {
			throw createBridgeError(
				"TIMEOUT",
				"Bridge response notification was received without payload.",
			);
		}

		const parsedResponse = parseStoredBridgeResponse(storedResponse);

		if (parsedResponse.type === "error_response") {
			throw createBridgeError("INVALID_RESPONSE", parsedResponse.message);
		}

		validateResponseType(input.request.type, parsedResponse.type);
		return parsedResponse;
	} finally {
		await Promise.allSettled([
			redis.del(requestTypeStateKey),
			redis.del(storedResponseKey),
		]);
		await subscriber.unsubscribe(responseEventChannel).catch(() => undefined);
		await subscriber.quit().catch(() => {
			subscriber.disconnect();
		});
	}
}

export async function resolveBridgeResponse(input: {
	sessionId: string;
	token: string;
	response: BridgeResponse;
}): Promise<void> {
	await getAuthorizedSession(input.sessionId, input.token);

	const redis = getRedisClient();
	const requestId = input.response.requestId;
	const requestTypeStateKey = requestTypeKey(input.sessionId, requestId);
	const expectedRequestTypeRaw = await redis.get(requestTypeStateKey);

	if (!expectedRequestTypeRaw) {
		throw createBridgeError(
			"NOT_FOUND",
			`Pending request was not found: ${requestId}`,
		);
	}

	const expectedRequestType = toRequestType(expectedRequestTypeRaw);

	if (input.response.type === "error_response") {
		await storeBridgeResponse({
			sessionId: input.sessionId,
			requestId,
			response: input.response,
		});
		return;
	}

	try {
		validateResponseType(expectedRequestType, input.response.type);
	} catch (error) {
		const bridgeError =
			error instanceof BridgeBrokerError
				? error
				: createBridgeError(
						"INVALID_RESPONSE",
						"Unexpected bridge response type.",
					);

		await storeBridgeResponse({
			sessionId: input.sessionId,
			requestId,
			response: {
				type: "error_response",
				requestId,
				message: bridgeError.message,
			},
		});
		throw bridgeError;
	}

	await storeBridgeResponse({
		sessionId: input.sessionId,
		requestId,
		response: input.response,
	});
}

export function toBridgeError(error: unknown): BridgeBrokerError {
	if (error instanceof BridgeBrokerError) {
		return error;
	}

	const message =
		error instanceof Error ? error.message : "Unexpected bridge failure.";
	return createBridgeError("INTERNAL", message);
}
