import Redis from "ioredis";
import type {
  CloudChatSessionState,
  CloudChatStateStore,
} from "@giselles-ai/agent-runtime";

const CHAT_STATE_TTL_SEC = 60 * 60;
const REDIS_URL_ENV_CANDIDATES = [
  "REDIS_URL",
  "REDIS_TLS_URL",
  "KV_URL",
  "UPSTASH_REDIS_TLS_URL",
  "UPSTASH_REDIS_URL",
] as const;

declare global {
  var __cloudChatRunnerRedis: Redis | undefined;
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

function getRedis(): Redis {
  if (!globalThis.__cloudChatRunnerRedis) {
    globalThis.__cloudChatRunnerRedis = new Redis(resolveRedisUrl(), {
      maxRetriesPerRequest: 2,
    });
  }

  return globalThis.__cloudChatRunnerRedis;
}

function key(chatId: string): string {
  return `cloud-chat:${chatId}`;
}

export class RedisCloudChatStateStore implements CloudChatStateStore {
  async load(chatId: string): Promise<CloudChatSessionState | null> {
    const raw = await getRedis().get(key(chatId));
    return raw ? (JSON.parse(raw) as CloudChatSessionState) : null;
  }

  async save(state: CloudChatSessionState): Promise<void> {
    await getRedis().set(
      key(state.chatId),
      JSON.stringify(state),
      "EX",
      CHAT_STATE_TTL_SEC,
    );
  }

  async delete(chatId: string): Promise<void> {
    await getRedis().del(key(chatId));
  }
}
