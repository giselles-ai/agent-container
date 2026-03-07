export type AgentFile = {
	path: string;
	content: string;
};

export type AgentConfig = {
	/** Agent type. Defaults to "gemini". */
	agentType?: "gemini" | "codex";
	/** Content for AGENTS.md in the sandbox. */
	agentMd?: string;
	/** Additional files to write into the sandbox. */
	files?: AgentFile[];
};

export type DefinedAgent = {
	readonly agentType: "gemini" | "codex";
	readonly agentMd?: string;
	readonly files: AgentFile[];
	/** Snapshot ID resolved from env at runtime. Throws if not set. */
	readonly snapshotId: string;
};
