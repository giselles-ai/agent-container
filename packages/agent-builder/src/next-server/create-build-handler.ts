import { Sandbox } from "@vercel/sandbox";
import type { BuildHandlerConfig, BuildRequest, BuildResponse } from "./types";
import { getCachedSnapshotId, setCachedSnapshotId } from "./snapshot-cache";

function extractBearerToken(request: Request): string | undefined {
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) {
		return undefined;
	}

	return header.slice(7).trim() || undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, { status });
}

function errorResponse(message: string, status: number): Response {
	return jsonResponse({ ok: false, message }, status);
}

function parseBuildRequest(body: unknown): BuildRequest | null {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return null;
	}

	const record = body as Record<string, unknown>;
	const baseSnapshotId = record.base_snapshot_id;
	const configHash = record.config_hash;
	const agentType = record.agent_type;
	const files = record.files;

	if (typeof baseSnapshotId !== "string" || !baseSnapshotId.trim()) {
		return null;
	}
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
		base_snapshot_id: baseSnapshotId.trim(),
		config_hash: configHash.trim(),
		agent_type: agentType,
		files: parsedFiles,
	};
}

export function createBuildHandler(config?: BuildHandlerConfig) {
	return async (request: Request): Promise<Response> => {
		if (config?.verifyToken) {
			const token = extractBearerToken(request);
			if (!token) {
				return errorResponse("Missing authorization token.", 401);
		}

			const valid = await config.verifyToken(token);
			if (!valid) {
				return errorResponse("Invalid authorization token.", 401);
			}
		}

		const body = await request.json().catch(() => null);
		const parsed = parseBuildRequest(body);
		if (!parsed) {
			return errorResponse("Invalid build request.", 400);
		}

		const cached = getCachedSnapshotId(parsed.config_hash);
		if (cached) {
			console.log(
				`[agent-builder] cache hit: hash=${parsed.config_hash} -> snapshot=${cached}`,
			);
			const response: BuildResponse = {
				snapshot_id: cached,
				cached: true,
			};
			return jsonResponse(response);
		}

		try {
			const sandbox = await Sandbox.create({
				source: { type: "snapshot", snapshotId: parsed.base_snapshot_id },
			});
			console.log(
				`[agent-builder] sandbox created: ${sandbox.sandboxId} from ${parsed.base_snapshot_id}`,
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
			console.log(`[agent-builder] snapshot created: ${snapshot.snapshotId}`);

			setCachedSnapshotId(parsed.config_hash, snapshot.snapshotId);

			const response: BuildResponse = {
				snapshot_id: snapshot.snapshotId,
				cached: false,
			};
			return jsonResponse(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[agent-builder] build failed: ${message}`);
			return errorResponse(`Build failed: ${message}`, 500);
		}
	};
}
