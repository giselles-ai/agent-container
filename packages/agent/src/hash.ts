import { createHash } from "node:crypto";

import type { AgentConfig } from "./types";

export function computeConfigHash(config: AgentConfig): string {
	const payload = JSON.stringify({
		agentType: config.agentType ?? "gemini",
		agentMd: config.agentMd ?? null,
		files: (config.files ?? []).map((f) => ({
			path: f.path,
			content: f.content,
		})),
		setup: config.setup?.script ?? null,
	});

	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
