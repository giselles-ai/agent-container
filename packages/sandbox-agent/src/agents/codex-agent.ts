import type { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import type { ChatAgent } from "../chat-run";
import { createCodexStdoutMapper } from "./codex-mapper";

const codexRequestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

export type CodexAgentRequest = z.infer<typeof codexRequestSchema>;

export type CodexAgentOptions = {
	snapshotId?: string;
	env?: Record<string, string>;
};

function requiredEnv(env: Record<string, string>, name: string): string {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function createCodexAgent(
	options: CodexAgentOptions = {},
): ChatAgent<CodexAgentRequest> {
	const env = options.env ?? {};
	const snapshotId =
		options.snapshotId?.trim() || requiredEnv(env, "SANDBOX_SNAPSHOT_ID");

	const apiKey = env.CODEX_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		throw new Error(
			"Missing required environment variable: CODEX_API_KEY or OPENAI_API_KEY",
		);
	}

	return {
		requestSchema: codexRequestSchema,
		snapshotId,
		async prepareSandbox(_input: {
			input: CodexAgentRequest;
			sandbox: Sandbox;
		}): Promise<void> {
			// No sandbox preparation needed for initial Codex integration.
		},
		createCommand({ input }) {
			const args = [
				"exec",
				"--json",
				"--yolo",
				"--skip-git-repo-check",
				input.message,
			];

			return {
				cmd: "codex",
				args,
				env: {
					OPENAI_API_KEY: apiKey,
				},
			};
		},
		createStdoutMapper() {
			return createCodexStdoutMapper();
		},
	};
}
