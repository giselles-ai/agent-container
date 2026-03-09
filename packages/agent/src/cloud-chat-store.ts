import type {
	CloudChatSessionState,
	CloudChatStateStore,
} from "./cloud-chat-state";
import { createRedisClient, type RedisClient } from "./redis";

const CHAT_STATE_TTL_SEC = 60 * 60;

export type AgentApiStoreConfig = {
	adapter: "redis";
	url?: string;
};

function key(chatId: string): string {
	return `cloud-chat:${chatId}`;
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

export async function resolveCloudChatStateStore(
	store: AgentApiStoreConfig,
): Promise<CloudChatStateStore> {
	switch (store.adapter) {
		case "redis": {
			const redis = await createRedisClient(store.url);
			return new RedisCloudChatStateStore(redis);
		}
	}
}
