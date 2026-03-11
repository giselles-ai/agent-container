import { Sandbox } from "@vercel/sandbox";

import type { RedisClient } from "./redis";

type BuildRequest = {
	config_hash: string;
	agent_type: "gemini" | "codex";
	files: Array<{ path: string; content: string }>;
	setup_script: string | null;
};

type BuildResponse = {
	snapshot_id: string;
	cached: boolean;
};

const CACHE_KEY_PREFIX = "agent-build:snapshot:";
const CACHE_TTL_SEC = 60 * 60 * 24;

const memoryCache = new Map<string, string>();

export interface SnapshotCache {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
}

class MemorySnapshotCache implements SnapshotCache {
	async get(key: string): Promise<string | null> {
		return memoryCache.get(key) ?? null;
	}
	async set(key: string, value: string): Promise<void> {
		memoryCache.set(key, value);
	}
}

class RedisSnapshotCache implements SnapshotCache {
	constructor(private readonly redis: RedisClient) {}

	async get(key: string): Promise<string | null> {
		return this.redis.get(`${CACHE_KEY_PREFIX}${key}`);
	}
	async set(key: string, value: string): Promise<void> {
		await this.redis.set(
			`${CACHE_KEY_PREFIX}${key}`,
			value,
			"EX",
			CACHE_TTL_SEC,
		);
	}
}

export function createSnapshotCache(redis?: RedisClient): SnapshotCache {
	return redis ? new RedisSnapshotCache(redis) : new MemorySnapshotCache();
}

function resolveBaseSnapshotId(configured?: string): string | undefined {
	const envValue = process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID?.trim();
	if (envValue) {
		return envValue;
	}
	return configured?.trim() || undefined;
}

function parseBuildRequest(body: unknown): BuildRequest | null {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return null;
	}

	const record = body as Record<string, unknown>;
	const configHash = record.config_hash;
	const agentType = record.agent_type;
	const files = record.files;
	const setupScript = record.setup_script;

	if (typeof configHash !== "string" || !configHash.trim()) {
		return null;
	}
	if (agentType !== "gemini" && agentType !== "codex") {
		return null;
	}
	if (!Array.isArray(files)) {
		return null;
	}

	const parsedFiles: BuildRequest["files"] = [];
	let parsedSetupScript: string | null = null;

	for (const file of files) {
		if (!file || typeof file !== "object" || Array.isArray(file)) {
			return null;
		}

		const recordFile = file as Record<string, unknown>;
		if (
			typeof recordFile.path !== "string" ||
			typeof recordFile.content !== "string"
		) {
			return null;
		}

		parsedFiles.push({
			path: recordFile.path,
			content: recordFile.content,
		});
	}

	if (setupScript !== undefined && setupScript !== null) {
		if (typeof setupScript !== "string") {
			return null;
		}
		parsedSetupScript = setupScript;
	}

	return {
		config_hash: configHash.trim(),
		agent_type: agentType,
		files: parsedFiles,
		setup_script: parsedSetupScript,
	};
}

export async function buildAgent(input: {
	request: Request;
	baseSnapshotId?: string;
	cache?: SnapshotCache;
}): Promise<Response> {
	const cache = input.cache ?? new MemorySnapshotCache();
	const body = await input.request.json().catch(() => null);
	const parsed = parseBuildRequest(body);
	if (!parsed) {
		return Response.json(
			{ ok: false, message: "Invalid build request." },
			{ status: 400 },
		);
	}

	const baseSnapshotId = resolveBaseSnapshotId(input.baseSnapshotId);
	if (!baseSnapshotId) {
		return Response.json(
			{
				ok: false,
				message:
					"Missing base snapshot ID. Set GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID or configure build.baseSnapshotId.",
			},
			{ status: 500 },
		);
	}

	const cacheKey = `${baseSnapshotId}:${parsed.config_hash}`;
	const cached = await cache.get(cacheKey);
	if (cached) {
		console.log(
			`[agent-build] cache hit: hash=${cacheKey} -> snapshot=${cached}`,
		);
		const response: BuildResponse = { snapshot_id: cached, cached: true };
		return Response.json(response);
	}

	const sandbox = await Sandbox.create({
		source: { type: "snapshot", snapshotId: baseSnapshotId },
	});
	console.log(
		`[agent-build] sandbox created: ${sandbox.sandboxId} from ${baseSnapshotId}`,
	);

	if (parsed.files.length > 0) {
		await sandbox.writeFiles(
			parsed.files.map((file) => ({
				path: file.path,
				content: Buffer.from(file.content),
			})),
		);
	}

	if (parsed.setup_script) {
		console.log("[agent-build] running setup script...");
		const result = await sandbox.runCommand("bash", [
			"-lc",
			parsed.setup_script,
		]);
		if (result.exitCode !== 0) {
			const stderr = typeof result.stderr === "string" ? result.stderr : "";
			throw new Error(
				`Setup script failed (exit ${result.exitCode}): ${stderr}`,
			);
		}
		console.log("[agent-build] setup script completed");
	}

	const snapshot = await sandbox.snapshot();
	console.log(`[agent-build] snapshot created: ${snapshot.snapshotId}`);

	await cache.set(cacheKey, snapshot.snapshotId);

	const response: BuildResponse = {
		snapshot_id: snapshot.snapshotId,
		cached: false,
	};
	return Response.json(response);
}
