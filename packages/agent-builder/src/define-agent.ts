import type { AgentConfig, DefinedAgent } from "./types";

export function defineAgent(config: AgentConfig): DefinedAgent {
  return {
    ...config,
    get snapshotId(): string {
      const id = process.env.GISELLE_SNAPSHOT_ID;
      if (!id) {
        throw new Error(
          "GISELLE_SNAPSHOT_ID is not set. Ensure withGiselleAgent is configured in next.config.ts.",
        );
      }
      return id;
    },
  };
}
