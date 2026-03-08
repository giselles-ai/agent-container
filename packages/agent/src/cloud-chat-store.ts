import type {
	CloudChatSessionState,
	CloudChatStateStore,
} from "./cloud-chat-state";

const CHAT_STATE_TTL_SEC = 60 * 60;
const REDIS_URL_ENV_NAME = "REDIS_URL";

export type AgentApiStoreConfig = {
	adapter: "redis";
	url?: string;
};

type RedisClient = {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		mode: "EX",
		ttlSeconds: number,
	): Promise<unknown>;
	del(key: string): Promise<unknown>;
};

function key(chatId: string): string {
	return `cloud-chat:${chatId}`;
}

function resolveRedisUrl(url?: string): string {
	const resolved = url?.trim() || process.env.REDIS_URL?.trim();
	if (resolved) {
		return resolved;
	}

	throw new Error(
		`Missing Redis URL. Set ${REDIS_URL_ENV_NAME} or pass store.url.`,
	);
}

class RedisCloudChatStateStore implements CloudChatStateStore {
	constructor(private readonly redis: RedisClient) {}

	async load(chatId: string): Promise<CloudChatSessionState | null> {
		const raw = await this.redis.get(key(chatId));
		return raw ? (JSON.parse(raw) as CloudChatSessionState) : null;
	}

	async save(state: CloudChatSessionState): Promise<void> {
		await this.redis.set(
			key(state.chatId),
			JSON.stringify(state),
			"EX",
			CHAT_STATE_TTL_SEC,
		);
	}

	async delete(chatId: string): Promise<void> {
		await this.redis.del(key(chatId));
	}
}

async function createRedisStore(url?: string): Promise<CloudChatStateStore> {
	let RedisCtor: new (
		url: string,
		options: { maxRetriesPerRequest: number },
	) => RedisClient;

	try {
		const module = await import("ioredis");
		RedisCtor = module.default as typeof RedisCtor;
	} catch {
		throw new Error(
			"Redis store adapter requires `ioredis` to be installed as a peer dependency.",
		);
	}

	const redis = new RedisCtor(resolveRedisUrl(url), {
		maxRetriesPerRequest: 2,
	});

	return new RedisCloudChatStateStore(redis);
}

export async function resolveCloudChatStateStore(
	store: AgentApiStoreConfig,
): Promise<CloudChatStateStore> {
	switch (store.adapter) {
		case "redis":
			return createRedisStore(store.url);
	}
}
