import { createHash } from "node:crypto";

import type { AgentConfig } from "./types";

export function computeConfigHash(
	config: AgentConfig,
	baseSnapshotId: string,
): string {
	const payload = JSON.stringify({
		baseSnapshotId,
		agentType: config.agentType ?? "gemini",
		agentMd: config.agentMd ?? null,
		files: (config.files ?? []).map((f) => ({
			path: f.path,
			content: f.content,
		})),
	});

	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
