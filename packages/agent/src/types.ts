/** Minimal interface for a json-render catalog. */
export type UICatalog = {
	prompt(options?: {
		mode?: "inline" | "standalone";
		customRules?: string[];
	}): string;
};

export type AgentFile = {
	path: string;
	content: string;
};

export type AgentSetup = {
	/** Shell script to run inside the sandbox during build. Executed as `bash -lc`. */
	script: string;
};

export type AgentConfig = {
	/** Agent type. Defaults to "gemini". */
	agentType?: "gemini" | "codex";
	/** Content for AGENTS.md in the sandbox. */
	agentMd?: string;
	/** Optional json-render catalog for generative UI. */
	catalog?: UICatalog;
	/** Environment variables passed to the sandbox at build and run time. */
	env?: Record<string, string | undefined>;
	/** Additional files to write into the sandbox. */
	files?: AgentFile[];
	/** Setup configuration for the sandbox build phase. */
	setup?: AgentSetup;
};

export type DefinedAgent = {
	readonly agentType: "gemini" | "codex";
	readonly agentMd?: string;
	readonly catalog?: UICatalog;
	readonly files: AgentFile[];
	/** Setup configuration. Undefined when no setup is configured. */
	readonly setup?: AgentSetup;
	/** Environment variables. */
	readonly env: Record<string, string>;
	/** Snapshot ID resolved from env at runtime. Throws if not set. */
	readonly snapshotId: string;
};
