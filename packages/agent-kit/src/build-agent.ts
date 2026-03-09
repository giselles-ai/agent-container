import { register } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type BuildAgentOptions = {
	agentPath: string;
	baseUrl?: string;
	token?: string;
};

export async function buildAgent(options: BuildAgentOptions): Promise<void> {
	register("tsx/esm", import.meta.url);

	const resolved = path.resolve(options.agentPath);
	const mod = await import(pathToFileURL(resolved).href);

	const agent = mod.agent ?? mod.default;
	if (!agent) {
		throw new Error(
			`No agent config found in ${options.agentPath}. Export a named "agent" or default export.`,
		);
	}

	const { requestBuild } = await import("@giselles-ai/agent");

	const result = await requestBuild(agent, {
		baseUrl: options.baseUrl,
		token: options.token,
	});

	if (result.cached) {
		console.log(
			`[agent-kit] Build cached: snapshot_id=${result.snapshot_id}`,
		);
	} else {
		console.log(
			`[agent-kit] Build success: snapshot_id=${result.snapshot_id}`,
		);
	}
}
