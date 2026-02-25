import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedisState = vi.hoisted(() => ({
	store: new Map<string, string>(),
	setCalls: [] as Array<{
		key: string;
		value: string;
		args: unknown[];
	}>,
}));

vi.mock("ioredis", () => {
	class FakeRedis {
		async set(key: string, value: string, ...args: unknown[]): Promise<"OK"> {
			mockRedisState.store.set(key, value);
			mockRedisState.setCalls.push({ key, value, args });
			return "OK";
		}

		async get(key: string): Promise<string | null> {
			return mockRedisState.store.get(key) ?? null;
		}

		async del(key: string): Promise<number> {
			return mockRedisState.store.delete(key) ? 1 : 0;
		}
	}

	return {
		default: FakeRedis,
	};
});

import {
	createSession,
	deleteSession,
	getLiveConnection,
	loadSession,
	removeLiveConnection,
	saveLiveConnection,
	updateSession,
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
		mockRedisState.store.clear();
		mockRedisState.setCalls.length = 0;
		delete globalThis.__giselleProviderRedis;
		delete globalThis.__giselleProviderSessions;
		process.env.REDIS_URL = "redis://unit-test";
	});

	it("creates and loads a session with the expected key format", async () => {
		await createSession({
			providerSessionId: "provider-s-1",
			createdAt: 123,
		});

		expect(
			mockRedisState.store.has("giselle:provider:session:provider-s-1"),
		).toBe(true);

		const loaded = await loadSession("provider-s-1");
		expect(loaded).toEqual({
			providerSessionId: "provider-s-1",
			createdAt: 123,
		});
	});

	it("returns null for missing and malformed sessions", async () => {
		const missing = await loadSession("missing");
		expect(missing).toBeNull();

		mockRedisState.store.set("giselle:provider:session:bad", "{not-json");
		const malformed = await loadSession("bad");
		expect(malformed).toBeNull();
	});

	it("updates a session and refreshes TTL", async () => {
		await createSession({
			providerSessionId: "provider-s-2",
			createdAt: 456,
			geminiSessionId: "g-1",
		});
		await updateSession("provider-s-2", {
			pendingRequestId: "req-1",
		});

		const loaded = await loadSession("provider-s-2");
		expect(loaded).toEqual({
			providerSessionId: "provider-s-2",
			createdAt: 456,
			geminiSessionId: "g-1",
			pendingRequestId: "req-1",
		});

		expect(mockRedisState.setCalls).toHaveLength(2);
		expect(mockRedisState.setCalls[0].args).toEqual(["EX", 600]);
		expect(mockRedisState.setCalls[1].args).toEqual(["EX", 600]);
	});

	it("saves, reads, and removes live connections", async () => {
		const { connection, cancel, releaseLock, closeRelay } =
			createConnectionMock();
		saveLiveConnection("provider-s-3", connection);

		expect(getLiveConnection("provider-s-3")).toBe(connection);

		await removeLiveConnection("provider-s-3");
		expect(getLiveConnection("provider-s-3")).toBeUndefined();
		expect(closeRelay).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("deleteSession removes redis metadata and live connection", async () => {
		await createSession({
			providerSessionId: "provider-s-4",
			createdAt: 789,
		});
		const { connection } = createConnectionMock();
		saveLiveConnection("provider-s-4", connection);

		await deleteSession("provider-s-4");

		expect(await loadSession("provider-s-4")).toBeNull();
		expect(getLiveConnection("provider-s-4")).toBeUndefined();
	});
});
