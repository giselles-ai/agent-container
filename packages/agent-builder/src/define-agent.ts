import type { AgentConfig, DefinedAgent } from "./types";

const SNAPSHOT_ENV_KEY = "GISELLE_SNAPSHOT_ID";

export function defineAgent(config: AgentConfig): DefinedAgent {
	return {
		agentType: config.agentType ?? "gemini",
		agentMd: config.agentMd,
		files: config.files ?? [],
		get snapshotId(): string {
			const id = process.env[SNAPSHOT_ENV_KEY];
			if (!id) {
				throw new Error(
					`${SNAPSHOT_ENV_KEY} is not set. Ensure withGiselleAgent is configured in next.config.ts.`,
				);
			}
			return id;
		},
	};
}
