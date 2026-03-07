import { Sandbox } from "@vercel/sandbox";

type BuildRequest = {
	config_hash: string;
	agent_type: "gemini" | "codex";
	files: Array<{ path: string; content: string }>;
};

type BuildResponse = {
	snapshot_id: string;
	cached: boolean;
};

const snapshotCache = new Map<string, string>();

function resolveBaseSnapshotId(configured?: string): string | undefined {
	const envValue = process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID?.trim();
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

	return {
		config_hash: configHash.trim(),
		agent_type: agentType,
		files: parsedFiles,
	};
}

export async function buildAgent(input: {
	request: Request;
	baseSnapshotId?: string;
}): Promise<Response> {
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
					"Missing base snapshot ID. Set GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID or configure build.baseSnapshotId.",
			},
			{ status: 500 },
		);
	}

	const cacheKey = `${baseSnapshotId}:${parsed.config_hash}`;
	const cached = snapshotCache.get(cacheKey);
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

	const snapshot = await sandbox.snapshot();
	console.log(`[agent-build] snapshot created: ${snapshot.snapshotId}`);

	snapshotCache.set(cacheKey, snapshot.snapshotId);

	const response: BuildResponse = {
		snapshot_id: snapshot.snapshotId,
		cached: false,
	};
	return Response.json(response);
}
