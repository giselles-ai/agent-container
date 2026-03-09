import type { NextConfig } from "next";

import { requestBuild } from "../request-build";
import type { AgentConfig } from "../types";
import type { GiselleAgentPluginOptions } from "./types";

export function withGiselleAgent(
	nextConfig: NextConfig,
	agent: AgentConfig,
	options?: GiselleAgentPluginOptions,
): () => Promise<NextConfig> {
	return async () => {
		const token = options?.token ?? process.env.GISELLE_AGENT_API_KEY;

		if (!token) {
			console.warn("[withGiselleAgent] Skipped snapshot build: missing token.");
			return nextConfig;
		}

		console.debug("[withGiselleAgent] Building agent snapshot...");

		const result = await requestBuild(agent, {
			baseUrl: options?.baseUrl,
			token,
			headers: options?.headers,
		});

		console.debug(
			"[withGiselleAgent] result:",
			JSON.stringify(result, null, 2),
		);

		return {
			...nextConfig,
			env: {
				...nextConfig.env,
				GISELLE_AGENT_SNAPSHOT_ID: result.snapshot_id,
			},
		};
	};
}
