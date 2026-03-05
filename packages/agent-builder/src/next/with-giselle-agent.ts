import type { NextConfig } from "next";

import { computeConfigHash } from "../hash";
import type { AgentConfig } from "../types";
import type { GiselleAgentPluginOptions } from "./types";

const SNAPSHOT_ENV_KEY = "GISELLE_SNAPSHOT_ID";

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function withGiselleAgent(
	nextConfig: NextConfig,
	agent: AgentConfig,
	options?: GiselleAgentPluginOptions,
): () => Promise<NextConfig> {
	return async () => {
		const apiUrl = trimTrailingSlash(
			options?.apiUrl ??
				process.env.GISELLE_API_URL ??
				"https://studio.giselles.ai",
		);
		const token = options?.token ?? process.env.EXTERNAL_AGENT_API_BEARER_TOKEN;
		const baseSnapshotId =
			options?.baseSnapshotId ?? process.env.SANDBOX_SNAPSHOT_ID;

		if (!token || !baseSnapshotId) {
			console.warn(
				"[withGiselleAgent] Skipped snapshot build: missing token or baseSnapshotId.",
			);
			return nextConfig;
		}

		const configHash = computeConfigHash(agent, baseSnapshotId);

		const files: Array<{ path: string; content: string }> = [
			...(agent.files ?? []),
		];
		if (agent.agentMd !== undefined) {
			files.push({
				path: "/home/vercel-sandbox/.codex/AGENTS.md",
				content: agent.agentMd,
			});
		}

		const response = await fetch(`${apiUrl}/agent-api/build`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				base_snapshot_id: baseSnapshotId,
				config_hash: configHash,
				agent_type: agent.agentType ?? "gemini",
				files,
			}),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`[withGiselleAgent] Build failed (${response.status}): ${body}`,
			);
		}

		const result = (await response.json()) as {
			snapshot_id: string;
			cached: boolean;
		};

		return {
			...nextConfig,
			env: {
				...nextConfig.env,
				[SNAPSHOT_ENV_KEY]: result.snapshot_id,
			},
		};
	};
}
