import { computeConfigHash } from "./hash";
import type { AgentConfig } from "./types";

export type RequestBuildOptions = {
	/** Base URL for the agent API. Default: process.env.GISELLE_AGENT_BASE_URL ?? "https://studio.giselles.ai/agent-api" */
	baseUrl?: string;
	/** Bearer token. Default: process.env.GISELLE_AGENT_API_KEY */
	token?: string;
	/** Additional headers to include in the build API request */
	headers?: Record<string, string | undefined>;
};

export type BuildResult = {
	snapshot_id: string;
	cached: boolean;
};

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

function resolveFiles(
	agent: AgentConfig,
): Array<{ path: string; content: string }> {
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
	return files;
}

export async function requestBuild(
	agent: AgentConfig,
	options?: RequestBuildOptions,
): Promise<BuildResult> {
	const baseUrl = trimTrailingSlash(
		options?.baseUrl ??
			process.env.GISELLE_AGENT_BASE_URL ??
			"https://studio.giselles.ai/agent-api",
	);
	const apiUrl = `${baseUrl}/build`;
	const token = options?.token ?? process.env.GISELLE_AGENT_API_KEY;

	if (!token) {
		throw new Error("Missing API token. Set GISELLE_AGENT_API_KEY or pass options.token.");
	}

	const configHash = computeConfigHash(agent);
	const files = resolveFiles(agent);

	const requestBody = {
		config_hash: configHash,
		agent_type: agent.agentType ?? "gemini",
		files,
	};
	const requestHeaders = {
		"content-type": "application/json",
		authorization: `Bearer ${token}`,
		...options?.headers,
	};

	const response = await fetch(apiUrl, {
		method: "POST",
		headers: requestHeaders,
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(`Build failed (${response.status}): ${body}`);
	}

	return (await response.json()) as BuildResult;
}
