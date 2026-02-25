import Redis from "ioredis";
import type { LiveConnection, SessionMetadata } from "./types";

const SESSION_TTL_SEC = 600;
const REDIS_URL_ENV_CANDIDATES = [
	"REDIS_URL",
	"REDIS_TLS_URL",
	"KV_URL",
	"UPSTASH_REDIS_TLS_URL",
	"UPSTASH_REDIS_URL",
] as const;

declare global {
	var __giselleProviderRedis: Redis | undefined;
	var __giselleProviderSessions: Map<string, LiveConnection> | undefined;
}

function resolveRedisUrl(): string {
	for (const name of REDIS_URL_ENV_CANDIDATES) {
		const value = process.env[name]?.trim();
		if (value) {
			return value;
		}
	}

	throw new Error(
		`Missing Redis URL. Set one of: ${REDIS_URL_ENV_CANDIDATES.join(", ")}`,
	);
}

function getRedisClient(): Redis {
	if (!globalThis.__giselleProviderRedis) {
		globalThis.__giselleProviderRedis = new Redis(resolveRedisUrl(), {
			maxRetriesPerRequest: 2,
		});
	}

	return globalThis.__giselleProviderRedis;
}

function sessionKey(providerSessionId: string): string {
	return `giselle:provider:session:${providerSessionId}`;
}

function getLiveConnectionMap(): Map<string, LiveConnection> {
	if (!globalThis.__giselleProviderSessions) {
		globalThis.__giselleProviderSessions = new Map();
	}
	return globalThis.__giselleProviderSessions;
}

function parseSessionMetadata(raw: string): SessionMetadata | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") {
		return null;
	}

	const record = parsed as Partial<SessionMetadata>;
	if (
		typeof record.providerSessionId !== "string" ||
		typeof record.createdAt !== "number"
	) {
		return null;
	}

	return record as SessionMetadata;
}

/** Generate a new provider session ID and store initial metadata in Redis. */
export async function createSession(metadata: SessionMetadata): Promise<void> {
	const redis = getRedisClient();
	await redis.set(
		sessionKey(metadata.providerSessionId),
		JSON.stringify(metadata),
		"EX",
		SESSION_TTL_SEC,
	);
}

/** Load session metadata from Redis. Returns null if expired/missing. */
export async function loadSession(
	providerSessionId: string,
): Promise<SessionMetadata | null> {
	const redis = getRedisClient();
	const raw = await redis.get(sessionKey(providerSessionId));
	if (!raw) {
		return null;
	}

	return parseSessionMetadata(raw);
}

/** Update session metadata in Redis (partial update, re-sets TTL). */
export async function updateSession(
	providerSessionId: string,
	updates: Partial<SessionMetadata>,
): Promise<void> {
	const existing = await loadSession(providerSessionId);
	const next: SessionMetadata = {
		providerSessionId,
		createdAt: existing?.createdAt ?? Date.now(),
		...existing,
		...updates,
	};

	await createSession(next);
}

/** Delete session from Redis and remove LiveConnection from globalThis. */
export async function deleteSession(providerSessionId: string): Promise<void> {
	const redis = getRedisClient();
	await redis.del(sessionKey(providerSessionId));
	await removeLiveConnection(providerSessionId);
}

/** Save a LiveConnection to the globalThis Map. */
export function saveLiveConnection(
	providerSessionId: string,
	connection: LiveConnection,
): void {
	getLiveConnectionMap().set(providerSessionId, connection);
}

/** Get a LiveConnection from the globalThis Map. Returns undefined if not found. */
export function getLiveConnection(
	providerSessionId: string,
): LiveConnection | undefined {
	return getLiveConnectionMap().get(providerSessionId);
}

/** Remove a LiveConnection from the globalThis Map and close its resources. */
export async function removeLiveConnection(
	providerSessionId: string,
): Promise<void> {
	const map = getLiveConnectionMap();
	const connection = map.get(providerSessionId);
	if (!connection) {
		return;
	}

	map.delete(providerSessionId);

	if (connection.relaySubscription) {
		await connection.relaySubscription.close().catch(() => undefined);
	}

	await connection.reader.cancel().catch(() => undefined);
	try {
		connection.reader.releaseLock();
	} catch {
		// ignore released lock
	}
}
