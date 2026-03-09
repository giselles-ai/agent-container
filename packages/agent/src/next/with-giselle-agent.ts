import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

import { requestBuild } from "../request-build";
import type { AgentConfig } from "../types";
import type { GiselleAgentPluginOptions } from "./types";

function getSnapshotFile(agent: AgentConfig): string {
	const key = {
		agentType: agent.agentType,
		agentMd: agent.agentMd,
		files: agent.files,
	};
	const hash = crypto
		.createHash("sha256")
		.update(JSON.stringify(key))
		.digest("hex")
		.slice(0, 16);
	return path.join(process.cwd(), ".next", "giselle", hash);
}

export function withGiselleAgent(
	nextConfig: NextConfig,
	agent: AgentConfig,
	options?: GiselleAgentPluginOptions,
): (phase: string) => Promise<NextConfig> {
	return async () => {
		const snapshotFile = getSnapshotFile(agent);

		const cached = fs.existsSync(snapshotFile)
			? fs.readFileSync(snapshotFile, "utf-8").trim()
			: undefined;

		if (cached) {
			return {
				...nextConfig,
				env: {
					...nextConfig.env,
					GISELLE_AGENT_SNAPSHOT_ID: cached,
				},
			};
		}

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

		fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
		fs.writeFileSync(snapshotFile, result.snapshot_id);

		console.debug(
			"[withGiselleAgent] Snapshot:",
			result.snapshot_id,
			result.cached ? "(cached)" : "(new)",
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
