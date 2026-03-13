import type { AgentConfig, DefinedAgent } from "./types";

export function defineAgent(config: AgentConfig): DefinedAgent {
	const catalogPrompt = config.catalog?.prompt({ mode: "inline" });
	const agentMd = [config.agentMd, catalogPrompt].filter(Boolean).join("\n\n");

	return {
		agentType: config.agentType ?? "gemini",
		agentMd: agentMd || undefined,
		catalog: config.catalog,
		files: config.files ?? [],
		env: config.env
			? Object.fromEntries(
					Object.entries(config.env).filter(
						(entry): entry is [string, string] => entry[1] != null,
					),
				)
			: {},
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
