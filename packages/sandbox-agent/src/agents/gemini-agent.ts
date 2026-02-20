import type { MCPServerConfig } from "@google/gemini-cli-core";
import type { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import type { ChatAgent } from "../chat-run";

const GEMINI_SETTINGS_PATH = "/home/vercel-sandbox/.gemini/settings.json";

interface GeminiSettings {
	mcpServers?: Record<string, MCPServerConfig>;
	[key: string]: unknown;
}

const geminiRequestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
	relay_session_id: z.string().min(1).optional(),
	relay_token: z.string().min(1).optional(),
});

export type GeminiAgentRequest = z.infer<typeof geminiRequestSchema>;

export type GeminiAgentOptions = {
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

async function patchGeminiSettingsTransportEnv(
	sandbox: Sandbox,
	bridgeTransportEnv: Record<string, string>,
): Promise<void> {
	const buffer = await sandbox.readFileToBuffer({
		path: GEMINI_SETTINGS_PATH,
	});
	if (!buffer) {
		throw new Error(
			`Gemini settings not found in sandbox at ${GEMINI_SETTINGS_PATH}. Ensure the snapshot contains a pre-configured settings.json.`,
		);
	}

	const settings: GeminiSettings = JSON.parse(new TextDecoder().decode(buffer));

	if (settings.mcpServers) {
		settings.mcpServers = Object.fromEntries(
			Object.entries(settings.mcpServers).map(([key, server]) => [
				key,
				{
					...server,
					env: { ...server.env, ...bridgeTransportEnv },
				},
			]),
		);
	}

	await sandbox.writeFiles([
		{
			path: GEMINI_SETTINGS_PATH,
			content: Buffer.from(JSON.stringify(settings, null, 2)),
		},
	]);
}

function createGeminiRequestSchema(
	browserEnabled: boolean,
): z.ZodType<GeminiAgentRequest> {
	if (!browserEnabled) {
		return geminiRequestSchema;
	}

	return geminiRequestSchema.superRefine((value, ctx) => {
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
	parsed: GeminiAgentRequest,
): asserts parsed is GeminiAgentRequest & {
	relay_session_id: string;
	relay_token: string;
} {
	if (!parsed.relay_session_id || !parsed.relay_token) {
		throw new Error("relay_session_id and relay_token are required.");
	}
}

export function createGeminiAgent(
	options: GeminiAgentOptions = {},
): ChatAgent<GeminiAgentRequest> {
	const env = options.env ?? {};
	const snapshotId =
		options.snapshotId?.trim() || requiredEnv(env, "SANDBOX_SNAPSHOT_ID");
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
		requestSchema: createGeminiRequestSchema(browserToolEnabled),
		snapshotId,
		async prepareSandbox({ input, sandbox }): Promise<void> {
			if (!browserToolEnabled) {
				return;
			}

			requiredEnv(env, "VERCEL_OIDC_TOKEN");

			assertBrowserToolRelayCredentials(input);

			await patchGeminiSettingsTransportEnv(sandbox, env);
		},
		createCommand({ input }) {
			const args = [
				"--prompt",
				input.message,
				"--output-format",
				"stream-json",
				"--approval-mode",
				"yolo",
			];
			if (input.session_id) {
				args.push("--resume", input.session_id);
			}

			return {
				cmd: "gemini",
				args,
				env: {
					GEMINI_API_KEY: requiredEnv(env, "GEMINI_API_KEY"),
				},
			};
		},
	};
}
