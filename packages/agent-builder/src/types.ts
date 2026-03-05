export type AgentConfig = {
  agentType?: "gemini" | "codex";
  agentMd?: string;
};

export type DefinedAgent = AgentConfig & {
  readonly snapshotId: string;
};
