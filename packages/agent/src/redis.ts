const REDIS_URL_ENV_NAME = "REDIS_URL";

export type RedisClient = {
	get(key: string): Promise<string | null>;
	set(
		key: string,
		value: string,
		mode: "EX",
		ttlSeconds: number,
	): Promise<unknown>;
	del(key: string): Promise<unknown>;
};

function resolveRedisUrl(url?: string): string {
	const resolved = url?.trim() || process.env[REDIS_URL_ENV_NAME]?.trim();
	if (resolved) {
		return resolved;
	}

	throw new Error(
		`Missing Redis URL. Set ${REDIS_URL_ENV_NAME} or pass store.url.`,
	);
}

export async function createRedisClient(url?: string): Promise<RedisClient> {
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

	return new RedisCtor(resolveRedisUrl(url), {
		maxRetriesPerRequest: 2,
	});
}
