import type { AgentConfig, DefinedAgent } from "./types";

export function defineAgent(config: AgentConfig): DefinedAgent {
	return {
		agentType: config.agentType ?? "gemini",
		agentMd: config.agentMd,
		files: config.files ?? [],
		setup: config.setup,
		get snapshotId(): string {
			const id = process.env?.GISELLE_AGENT_SNAPSHOT_ID;
			if (!id) {
				throw new Error(
					`GISELLE_AGENT_SNAPSHOT_ID is not set. Ensure withGiselleAgent is configured in next.config.ts.`,
				);
			}
			return id;
		},
	};
}
