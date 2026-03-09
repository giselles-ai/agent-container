import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

import { requestBuild } from "../request-build";
import type { AgentConfig } from "../types";
import type { GiselleAgentPluginOptions } from "./types";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../../package.json");

const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[39m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;

function resolveBaseUrl(options?: GiselleAgentPluginOptions): string {
	return (
		options?.baseUrl ??
		process.env.GISELLE_AGENT_BASE_URL ??
		"https://studio.giselles.ai/agent-api"
	).replace(/\/+$/, "");
}

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
		const baseUrl = resolveBaseUrl(options);
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

		console.log("");
		console.log(`${magenta(bold(`✦ Giselle Agent ${PKG_VERSION}`))}`);
		console.log(`${dim("- Base URL:")} ${baseUrl}`);
		console.log("");

		const start = performance.now();

		const result = await requestBuild(agent, {
			baseUrl: options?.baseUrl,
			token,
			headers: options?.headers,
		});

		fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
		fs.writeFileSync(snapshotFile, result.snapshot_id);

		const elapsed = Math.round(performance.now() - start);
		const elapsedStr =
			elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`;

		console.log(`${green("✓")} Building...`);
		console.log(`${green("✓")} Ready in ${elapsedStr}`);
		console.log("");

		return {
			...nextConfig,
			env: {
				...nextConfig.env,
				GISELLE_AGENT_SNAPSHOT_ID: result.snapshot_id,
			},
		};
	};
}
