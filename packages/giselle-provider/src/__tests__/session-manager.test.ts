import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getLiveConnection,
	removeLiveConnection,
	saveLiveConnection,
} from "../session-manager";
import type { LiveConnection } from "../types";

function createConnectionMock(): {
	connection: LiveConnection;
	cancel: ReturnType<typeof vi.fn>;
	releaseLock: ReturnType<typeof vi.fn>;
	closeRelay: ReturnType<typeof vi.fn>;
} {
	const cancel = vi.fn(async () => undefined);
	const releaseLock = vi.fn(() => undefined);
	const closeRelay = vi.fn(async () => undefined);

	return {
		connection: {
			reader: {
				read: async () => ({ done: true, value: undefined }),
				cancel,
				releaseLock,
			} as unknown as ReadableStreamDefaultReader<Uint8Array>,
			buffer: "",
			relaySubscription: {
				nextRequest: async () => ({}),
				close: closeRelay,
			},
			textBlockOpen: false,
		},
		cancel,
		releaseLock,
		closeRelay,
	};
}

describe("session-manager", () => {
	beforeEach(() => {
		delete globalThis.__giselleProviderSessions;
	});

	it("saves and reads live connections", () => {
		const { connection } = createConnectionMock();
		saveLiveConnection("provider-s-1", connection);

		expect(getLiveConnection("provider-s-1")).toBe(connection);
	});

	it("removes live connections and closes held resources", async () => {
		const { connection, cancel, releaseLock, closeRelay } =
			createConnectionMock();
		saveLiveConnection("provider-s-2", connection);

		await removeLiveConnection("provider-s-2");

		expect(getLiveConnection("provider-s-2")).toBeUndefined();
		expect(closeRelay).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});
});
