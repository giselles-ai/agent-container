import * as TOML from "@iarna/toml";
import type { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import type { ChatAgent } from "../chat-run";
import { createCodexStdoutMapper } from "./codex-mapper";

const CODEX_CONFIG_PATH = "/home/vercel-sandbox/.codex/config.toml";

interface CodexConfig {
	mcp_servers?: Record<
		string,
		{
			command?: string;
			args?: string[];
			cwd?: string;
			env?: Record<string, string>;
			[key: string]: unknown;
		}
	>;
	[key: string]: unknown;
}

const codexRequestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
	relay_session_id: z.string().min(1).optional(),
	relay_token: z.string().min(1).optional(),
});

export type CodexAgentRequest = z.infer<typeof codexRequestSchema>;

export type CodexAgentOptions = {
	snapshotId?: string;
	env?: Record<string, string>;
	tools?: {
		browser?: {
			relayUrl?: string;
		};
	};
};

function requiredEnv(env: Record<string, string>, name: string): string {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

async function patchCodexConfigTransportEnv(
	sandbox: Sandbox,
	bridgeTransportEnv: Record<string, string>,
): Promise<void> {
	const buffer = await sandbox.readFileToBuffer({
		path: CODEX_CONFIG_PATH,
	});
	if (!buffer) {
		throw new Error(
			`Codex config not found in sandbox at ${CODEX_CONFIG_PATH}. Ensure the snapshot contains a pre-configured config.toml.`,
		);
	}

	const config: CodexConfig = TOML.parse(
		new TextDecoder().decode(buffer),
	) as CodexConfig;

	if (config.mcp_servers) {
		for (const server of Object.values(config.mcp_servers)) {
			server.env = { ...server.env, ...bridgeTransportEnv };
		}
	}

	await sandbox.writeFiles([
		{
			path: CODEX_CONFIG_PATH,
			content: Buffer.from(TOML.stringify(config as TOML.JsonMap)),
		},
	]);
}

function createCodexRequestSchema(
	browserEnabled: boolean,
): z.ZodType<CodexAgentRequest> {
	if (!browserEnabled) {
		return codexRequestSchema;
	}

	return codexRequestSchema.superRefine((value, ctx) => {
		if (!value.relay_session_id) {
			ctx.addIssue({
				code: "custom",
				path: ["relay_session_id"],
				message: "relay_session_id is required when tools.browser is enabled.",
			});
		}
		if (!value.relay_token) {
			ctx.addIssue({
				code: "custom",
				path: ["relay_token"],
				message: "relay_token is required when tools.browser is enabled.",
			});
		}
	});
}

function assertBrowserToolRelayCredentials(
	parsed: CodexAgentRequest,
): asserts parsed is CodexAgentRequest & {
	relay_session_id: string;
	relay_token: string;
} {
	if (!parsed.relay_session_id || !parsed.relay_token) {
		throw new Error("relay_session_id and relay_token are required.");
	}
}

export function createCodexAgent(
	options: CodexAgentOptions = {},
): ChatAgent<CodexAgentRequest> {
	const env = options.env ?? {};
	const snapshotId =
		options.snapshotId?.trim() || requiredEnv(env, "SANDBOX_SNAPSHOT_ID");

	// `codex exec` natively reads CODEX_API_KEY from the environment for
	// authentication. Do not use OPENAI_API_KEY — it is not supported by
	// `codex exec` and would silently fail.
	// See: https://developers.openai.com/codex/noninteractive/#authenticate-in-ci
	const apiKey = requiredEnv(env, "CODEX_API_KEY");

	const browserToolEnabled = options.tools?.browser !== undefined;
	const browserToolRelayUrl = options.tools?.browser?.relayUrl?.trim();
	if (browserToolEnabled) {
		requiredEnv(env, "BROWSER_TOOL_RELAY_URL");
		requiredEnv(env, "BROWSER_TOOL_RELAY_SESSION_ID");
		requiredEnv(env, "BROWSER_TOOL_RELAY_TOKEN");
	}
	if (browserToolEnabled && !browserToolRelayUrl) {
		throw new Error("tools.browser.relayUrl is empty.");
	}

	return {
		requestSchema: createCodexRequestSchema(browserToolEnabled),
		snapshotId,
		async prepareSandbox(_input: {
			input: CodexAgentRequest;
			sandbox: Sandbox;
		}): Promise<void> {
			if (!browserToolEnabled) {
				return;
			}

			requiredEnv(env, "VERCEL_OIDC_TOKEN");

			assertBrowserToolRelayCredentials(_input.input);

			await patchCodexConfigTransportEnv(_input.sandbox, env);
		},
		createCommand({ input }) {
			const args = ["exec"];

			if (input.session_id) {
				args.push("resume", input.session_id);
			}

			args.push("--json", "--yolo", "--skip-git-repo-check", input.message);

			return {
				cmd: "codex",
				args,
				env: { CODEX_API_KEY: apiKey },
			};
		},
		createStdoutMapper() {
			return createCodexStdoutMapper();
		},
	};
}
