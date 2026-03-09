import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudChatSessionState } from "./cloud-chat-state";

function createMockRedisClient() {
	return {
		get: vi.fn<() => Promise<string | null>>(),
		set: vi.fn<() => Promise<unknown>>(),
		del: vi.fn<() => Promise<unknown>>(),
	};
}

afterEach(() => {
	delete process.env.REDIS_URL;
	vi.doUnmock("ioredis");
	vi.restoreAllMocks();
});

describe("resolveCloudChatStateStore", () => {
	it("creates a Redis-backed store with an explicit URL", async () => {
		const state: CloudChatSessionState = {
			chatId: "chat-1",
			agentSessionId: "session-1",
			updatedAt: 1_730_000_000,
		};
		const redis = createMockRedisClient();
		redis.get.mockResolvedValueOnce(JSON.stringify(state));
		redis.set.mockResolvedValueOnce("OK");
		redis.del.mockResolvedValueOnce(1);

		const RedisCtor = vi.fn().mockImplementation(function (this: unknown) {
			return redis;
		});
		vi.doMock("ioredis", () => ({ default: RedisCtor }));

		const { resolveCloudChatStateStore } = await import("./cloud-chat-store");
		const store = await resolveCloudChatStateStore({
			adapter: "redis",
			url: "redis://custom",
		});

		await expect(store.load("chat-1")).resolves.toEqual(state);
		await store.save(state);
		await store.delete("chat-1");

		expect(RedisCtor).toHaveBeenCalledWith("redis://custom", {
			maxRetriesPerRequest: 2,
		});
		expect(redis.get).toHaveBeenCalledWith("cloud-chat:chat-1");
		expect(redis.set).toHaveBeenCalledWith(
			"cloud-chat:chat-1",
			JSON.stringify(state),
			"EX",
			3600,
		);
		expect(redis.del).toHaveBeenCalledWith("cloud-chat:chat-1");
	});

	it("falls back to process.env.REDIS_URL", async () => {
		process.env.REDIS_URL = "redis://env";
		const redis = createMockRedisClient();
		const RedisCtor = vi.fn().mockImplementation(function (this: unknown) {
			return redis;
		});
		vi.doMock("ioredis", () => ({ default: RedisCtor }));

		const { resolveCloudChatStateStore } = await import("./cloud-chat-store");
		await resolveCloudChatStateStore({ adapter: "redis" });

		expect(RedisCtor).toHaveBeenCalledWith("redis://env", {
			maxRetriesPerRequest: 2,
		});
	});

	it("throws a clear error when REDIS_URL is missing", async () => {
		const redis = createMockRedisClient();
		const RedisCtor = vi.fn().mockImplementation(function (this: unknown) {
			return redis;
		});
		vi.doMock("ioredis", () => ({ default: RedisCtor }));

		const { resolveCloudChatStateStore } = await import("./cloud-chat-store");
		await expect(
			resolveCloudChatStateStore({ adapter: "redis" }),
		).rejects.toThrow("Missing Redis URL. Set REDIS_URL or pass store.url.");
	});

	it("throws a clear error when ioredis is unavailable", async () => {
		vi.doMock("ioredis", () => {
			throw new Error("Cannot find package 'ioredis'");
		});

		const { resolveCloudChatStateStore } = await import("./cloud-chat-store");
		await expect(
			resolveCloudChatStateStore({
				adapter: "redis",
				url: "redis://custom",
			}),
		).rejects.toThrow(
			"Redis store adapter requires `ioredis` to be installed as a peer dependency.",
		);
	});
});
