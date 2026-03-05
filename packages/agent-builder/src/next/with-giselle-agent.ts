import type { NextConfig } from "next";

import { computeConfigHash } from "../hash";
import type { AgentConfig } from "../types";
import type { GiselleAgentPluginOptions } from "./types";

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
			options?.apiUrl ?? "https://studio.giselles.ai/agent-api/build-api",
		);
		const token = options?.token ?? process.env.SANDBOX_AGENT_API_KEY;
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
			files.push(
				{
					path: "/home/vercel-sandbox/.codex/AGENTS.md",
					content: agent.agentMd,
				},
				{
					path: "/home/vercel-sandbox/.gemini/GEMINI.md",
					content: agent.agentMd,
				},
			);
		}

		const requestBody = {
			base_snapshot_id: baseSnapshotId,
			config_hash: configHash,
			agent_type: agent.agentType ?? "gemini",
			files,
		};
		const requestHeaders = {
			"content-type": "application/json",
			authorization: `Bearer ${token}`,
			...options?.headers,
		};
		console.debug("[withGiselleAgent] POST %s", apiUrl);
		console.debug(
			"[withGiselleAgent] headers:",
			JSON.stringify(requestHeaders, null, 2),
		);
		console.debug(
			"[withGiselleAgent] body:",
			JSON.stringify(requestBody, null, 2),
		);

		const response = await fetch(apiUrl, {
			method: "POST",
			headers: requestHeaders,
			body: JSON.stringify(requestBody),
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
		console.debug(
			"[withGiselleAgent] result:",
			JSON.stringify(result, null, 2),
		);

		return {
			...nextConfig,
			env: {
				...nextConfig.env,
				GISELLE_SANDBOX_AGENT_SNAPSHOT_ID: result.snapshot_id,
			},
		};
	};
}
