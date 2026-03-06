import type { LiveConnection } from "./types";

declare global {
	var __giselleProviderSessions: Map<string, LiveConnection> | undefined;
}

function getLiveConnectionMap(): Map<string, LiveConnection> {
	if (!globalThis.__giselleProviderSessions) {
		globalThis.__giselleProviderSessions = new Map();
	}
	return globalThis.__giselleProviderSessions;
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
