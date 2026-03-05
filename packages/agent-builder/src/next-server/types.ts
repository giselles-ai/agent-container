export type BuildHandlerConfig = {
	/**
	 * Function to verify the Bearer token from the Authorization header.
	 * Return `true` if valid, `false` to reject with 401.
	 * If not provided, no auth check is performed.
	 */
	verifyToken?: (token: string) => boolean | Promise<boolean>;
};

export type BuildRequest = {
	base_snapshot_id: string;
	config_hash: string;
	agent_type: "gemini" | "codex";
	files: Array<{ path: string; content: string }>;
};

export type BuildResponse = {
	snapshot_id: string;
	cached: boolean;
};
