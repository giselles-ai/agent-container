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
		env: config.env
			? Object.fromEntries(
					Object.entries(config.env).sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					),
				)
			: null,
	});

	return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
