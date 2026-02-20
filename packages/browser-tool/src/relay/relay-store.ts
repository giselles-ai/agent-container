import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import {
	type RelayErrorCode,
	type RelayRequest,
	type RelayResponse,
	relayResponseSchema,
} from "../types";

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REQUEST_TTL_SEC = 60;
const DEFAULT_DISPATCH_TIMEOUT_MS = 20 * 1000;
const BROWSER_PRESENCE_TTL_SEC = 90;
export const RELAY_SSE_KEEPALIVE_INTERVAL_MS = 20 * 1000;

const REDIS_URL_ENV_CANDIDATES = [
	"REDIS_URL",
	"REDIS_TLS_URL",
	"KV_URL",
	"UPSTASH_REDIS_TLS_URL",
	"UPSTASH_REDIS_URL",
] as const;
const RELAY_SUBSCRIBER_REDIS_OPTIONS = {
	enableReadyCheck: false,
	autoResubscribe: false,
	autoResendUnfulfilledCommands: false,
	maxRetriesPerRequest: 2,
} as const;

type RelaySessionRecord = {
	token: string;
	expiresAt: number;
};

declare global {
	var __browserToolRelayRedis: Redis | undefined;
}

export class RelayStoreError extends Error {
	readonly code: RelayErrorCode;
	readonly status: number;

	constructor(code: RelayErrorCode, message: string, status: number) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

function createRelayError(
	code: RelayErrorCode,
	message: string,
): RelayStoreError {
	switch (code) {
		case "UNAUTHORIZED":
			return new RelayStoreError(code, message, 401);
		case "NO_BROWSER":
			return new RelayStoreError(code, message, 409);
		case "TIMEOUT":
			return new RelayStoreError(code, message, 408);
		case "INVALID_RESPONSE":
			return new RelayStoreError(code, message, 422);
		case "NOT_FOUND":
			return new RelayStoreError(code, message, 404);
		case "INTERNAL":
			return new RelayStoreError(code, message, 500);
		default:
			return new RelayStoreError("INTERNAL", message, 500);
	}
}

function resolveRedisUrl(): string {
	for (const name of REDIS_URL_ENV_CANDIDATES) {
		const value = process.env[name]?.trim();
		if (value) {
			return value;
		}
	}

	throw createRelayError(
		"INTERNAL",
		`Missing Redis URL. Set one of: ${REDIS_URL_ENV_CANDIDATES.join(", ")}`,
	);
}

function getRedisClient(): Redis {
	if (!globalThis.__browserToolRelayRedis) {
		globalThis.__browserToolRelayRedis = new Redis(resolveRedisUrl(), {
			maxRetriesPerRequest: 2,
		});
	}

	return globalThis.__browserToolRelayRedis;
}

export function createRelaySubscriber(): Redis {
	return getRedisClient().duplicate(RELAY_SUBSCRIBER_REDIS_OPTIONS);
}

function sessionKey(sessionId: string): string {
	return `relay:session:${sessionId}`;
}

function browserPresenceKey(sessionId: string): string {
	return `relay:browser:${sessionId}`;
}

function requestTypeKey(sessionId: string, requestId: string): string {
	return `relay:req:${sessionId}:${requestId}:type`;
}

function responseKey(sessionId: string, requestId: string): string {
	return `relay:resp:${sessionId}:${requestId}`;
}

export function relayRequestChannel(sessionId: string): string {
	return `relay:${sessionId}:request`;
}

function relayResponseChannel(sessionId: string, requestId: string): string {
	return `relay:${sessionId}:response:${requestId}`;
}

function sessionExpiryTimestamp(): number {
	return Date.now() + DEFAULT_SESSION_TTL_MS;
}

function parseSessionRecord(raw: string): RelaySessionRecord {
	let parsed: unknown = null;

	try {
		parsed = JSON.parse(raw);
	} catch {
		throw createRelayError(
			"INTERNAL",
			"Relay session payload in Redis is malformed.",
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
		throw createRelayError(
			"INTERNAL",
			"Relay session payload in Redis is invalid.",
		);
	}

	return {
		token: parsed.token,
		expiresAt: parsed.expiresAt,
	};
}

function toRequestType(value: string): RelayRequest["type"] {
	if (value === "snapshot_request" || value === "execute_request") {
		return value;
	}

	throw createRelayError(
		"INTERNAL",
		`Stored request type is invalid: ${value}`,
	);
}

function parseStoredRelayResponse(raw: string): RelayResponse {
	let decoded: unknown = null;

	try {
		decoded = JSON.parse(raw);
	} catch {
		throw createRelayError(
			"INVALID_RESPONSE",
			"Relay response payload in Redis is malformed.",
		);
	}

	const parsed = relayResponseSchema.safeParse(decoded);
	if (!parsed.success) {
		throw createRelayError(
			"INVALID_RESPONSE",
			"Relay response payload in Redis is invalid.",
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
): Promise<RelaySessionRecord> {
	const redis = getRedisClient();
	const raw = await redis.get(sessionKey(sessionId));

	if (!raw) {
		throw createRelayError(
			"UNAUTHORIZED",
			"Invalid relay session credentials.",
		);
	}

	const session = parseSessionRecord(raw);
	if (session.token !== token) {
		throw createRelayError(
			"UNAUTHORIZED",
			"Invalid relay session credentials.",
		);
	}

	const expiresAt = await touchSession(sessionId, token);
	return {
		token,
		expiresAt,
	};
}

function validateResponseType(
	requestType: RelayRequest["type"],
	responseType: RelayResponse["type"],
): void {
	if (
		requestType === "snapshot_request" &&
		responseType !== "snapshot_response"
	) {
		throw createRelayError(
			"INVALID_RESPONSE",
			`Expected snapshot_response, but received ${responseType}.`,
		);
	}

	if (
		requestType === "execute_request" &&
		responseType !== "execute_response"
	) {
		throw createRelayError(
			"INVALID_RESPONSE",
			`Expected execute_response, but received ${responseType}.`,
		);
	}
}

async function ensureBrowserConnected(sessionId: string): Promise<void> {
	const redis = getRedisClient();
	const isConnected = await redis.exists(browserPresenceKey(sessionId));

	if (isConnected === 0) {
		throw createRelayError(
			"NO_BROWSER",
			"No browser client is connected to this relay session.",
		);
	}
}

async function waitForRelayResponseSignal(input: {
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
				createRelayError(
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
				createRelayError(
					"TIMEOUT",
					"Timed out waiting for browser relay response.",
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

			if (error instanceof RelayStoreError) {
				reject(error);
				return;
			}

			const message =
				error instanceof Error ? error.message : "Unknown Redis publish error.";
			reject(
				createRelayError(
					"INTERNAL",
					`Failed to publish relay request. ${message}`,
				),
			);
		});
	});
}

async function storeRelayResponse(input: {
	sessionId: string;
	requestId: string;
	response: RelayResponse;
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
			relayResponseChannel(input.sessionId, input.requestId),
			input.requestId,
		)
		.exec();
}

export async function createRelaySession(): Promise<{
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

export async function assertRelaySession(
	sessionId: string,
	token: string,
): Promise<void> {
	await getAuthorizedSession(sessionId, token);
}

export async function markBrowserConnected(
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

export async function touchBrowserConnected(sessionId: string): Promise<void> {
	const redis = getRedisClient();
	await redis.set(
		browserPresenceKey(sessionId),
		"1",
		"EX",
		BROWSER_PRESENCE_TTL_SEC,
	);
}

export async function dispatchRelayRequest(input: {
	sessionId: string;
	token: string;
	request: RelayRequest;
	timeoutMs?: number;
}): Promise<RelayResponse> {
	await getAuthorizedSession(input.sessionId, input.token);
	await ensureBrowserConnected(input.sessionId);

	const redis = getRedisClient();
	const timeoutMs = input.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;
	const requestId = input.request.requestId;
	const requestTypeStateKey = requestTypeKey(input.sessionId, requestId);
	const storedResponseKey = responseKey(input.sessionId, requestId);
	const responseEventChannel = relayResponseChannel(input.sessionId, requestId);
	const subscriber = createRelaySubscriber();

	const setPending = await redis.set(
		requestTypeStateKey,
		input.request.type,
		"EX",
		DEFAULT_REQUEST_TTL_SEC,
		"NX",
	);

	if (setPending !== "OK") {
		throw createRelayError(
			"INVALID_RESPONSE",
			`Request id is already pending: ${requestId}`,
		);
	}

	try {
		await redis.del(storedResponseKey);
		await subscriber.subscribe(responseEventChannel);

		await waitForRelayResponseSignal({
			subscriber,
			channel: responseEventChannel,
			timeoutMs,
			trigger: async () => {
				await redis.publish(
					relayRequestChannel(input.sessionId),
					JSON.stringify(input.request),
				);
			},
		});

		const storedResponse = await redis.get(storedResponseKey);
		if (!storedResponse) {
			throw createRelayError(
				"TIMEOUT",
				"Relay response notification was received without payload.",
			);
		}

		const parsedResponse = parseStoredRelayResponse(storedResponse);

		if (parsedResponse.type === "error_response") {
			throw createRelayError("INVALID_RESPONSE", parsedResponse.message);
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

export async function resolveRelayResponse(input: {
	sessionId: string;
	token: string;
	response: RelayResponse;
}): Promise<void> {
	await getAuthorizedSession(input.sessionId, input.token);

	const redis = getRedisClient();
	const requestId = input.response.requestId;
	const requestTypeStateKey = requestTypeKey(input.sessionId, requestId);
	const expectedRequestTypeRaw = await redis.get(requestTypeStateKey);

	if (!expectedRequestTypeRaw) {
		throw createRelayError(
			"NOT_FOUND",
			`Pending request was not found: ${requestId}`,
		);
	}

	const expectedRequestType = toRequestType(expectedRequestTypeRaw);

	if (input.response.type === "error_response") {
		await storeRelayResponse({
			sessionId: input.sessionId,
			requestId,
			response: input.response,
		});
		return;
	}

	try {
		validateResponseType(expectedRequestType, input.response.type);
	} catch (error) {
		const relayError =
			error instanceof RelayStoreError
				? error
				: createRelayError(
						"INVALID_RESPONSE",
						"Unexpected relay response type.",
					);

		await storeRelayResponse({
			sessionId: input.sessionId,
			requestId,
			response: {
				type: "error_response",
				requestId,
				message: relayError.message,
			},
		});
		throw relayError;
	}

	await storeRelayResponse({
		sessionId: input.sessionId,
		requestId,
		response: input.response,
	});
}

export function toRelayError(error: unknown): RelayStoreError {
	if (error instanceof RelayStoreError) {
		return error;
	}

	const message =
		error instanceof Error ? error.message : "Unexpected relay failure.";
	return createRelayError("INTERNAL", message);
}
