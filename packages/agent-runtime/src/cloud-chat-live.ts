import type { RelayRequestSubscription } from "@giselles-ai/browser-tool/relay";

export type LiveCloudConnection = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	buffer: string;
	textBlockOpen: boolean;
	relaySubscription: RelayRequestSubscription | null;
	status: number;
	statusText: string;
	headers: Headers;
};

const liveCloudConnections = new Map<string, LiveCloudConnection>();

export function getLiveCloudConnection(
	chatId: string,
): LiveCloudConnection | undefined {
	return liveCloudConnections.get(chatId);
}

export function saveLiveCloudConnection(
	chatId: string,
	connection: LiveCloudConnection,
): void {
	liveCloudConnections.set(chatId, connection);
}

export async function removeLiveCloudConnection(chatId: string): Promise<void> {
	const connection = liveCloudConnections.get(chatId);
	liveCloudConnections.delete(chatId);

	if (!connection) {
		return;
	}

	await connection.relaySubscription?.close().catch(() => undefined);
	await connection.reader.cancel().catch(() => undefined);
	try {
		connection.reader.releaseLock();
	} catch {
		// ignore lock errors
	}
}
