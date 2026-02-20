import type { MCPServerConfig } from "@google/gemini-cli-core";
import type { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import type { ChatAgent } from "../chat-handler";

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
	browserTool?: {
		relayUrl?: string;
	};
};

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

function extractTokenFromRequest(request: Request): string | undefined {
	const oidcToken = request.headers.get("x-vercel-oidc-token")?.trim();
	if (oidcToken) {
		return oidcToken;
	}

	const authorization = request.headers.get("authorization")?.trim();
	if (!authorization) {
		return undefined;
	}

	if (/^bearer\s+/i.test(authorization)) {
		return authorization.replace(/^bearer\s+/i, "").trim();
	}

	return authorization;
}

function resolveDefaultSnapshotId(): string {
	return requiredEnv("SANDBOX_SNAPSHOT_ID");
}

function resolveDefaultBrowserToolRelayUrl(): string {
	return requiredEnv("BROWSER_TOOL_RELAY_URL");
}

function buildBridgeTransportEnv(input: {
	bridgeUrl: string;
	relaySessionId: string;
	relayToken: string;
	oidcToken?: string;
	vercelProtectionBypass?: string;
	giselleProtectionBypass?: string;
}): Record<string, string> {
	const env: Record<string, string> = {
		BROWSER_TOOL_RELAY_URL: input.bridgeUrl,
		BROWSER_TOOL_RELAY_SESSION_ID: input.relaySessionId,
		BROWSER_TOOL_RELAY_TOKEN: input.relayToken,
	};

	if (input.oidcToken) {
		env.VERCEL_OIDC_TOKEN = input.oidcToken;
	}

	if (input.vercelProtectionBypass?.trim()) {
		env.VERCEL_PROTECTION_BYPASS = input.vercelProtectionBypass.trim();
	}

	if (input.giselleProtectionBypass?.trim()) {
		env.GISELLE_PROTECTION_BYPASS = input.giselleProtectionBypass.trim();
	}

	return env;
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
	browserToolEnabled: boolean,
): z.ZodType<GeminiAgentRequest> {
	if (!browserToolEnabled) {
		return geminiRequestSchema;
	}

	return geminiRequestSchema.superRefine((value, ctx) => {
		if (!value.relay_session_id) {
			ctx.addIssue({
				code: "custom",
				path: ["relay_session_id"],
				message: "relay_session_id is required when browserTool is enabled.",
			});
		}
		if (!value.relay_token) {
			ctx.addIssue({
				code: "custom",
				path: ["relay_token"],
				message: "relay_token is required when browserTool is enabled.",
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
	const snapshotId = options.snapshotId?.trim() || resolveDefaultSnapshotId();
	const browserToolEnabled = options.browserTool !== undefined;
	const browserToolRelayUrl = browserToolEnabled
		? trimTrailingSlash(
				(
					options.browserTool?.relayUrl?.trim() ||
					resolveDefaultBrowserToolRelayUrl()
				).trim(),
			)
		: undefined;
	if (browserToolEnabled && !browserToolRelayUrl) {
		throw new Error("browserTool.relayUrl is empty.");
	}

	return {
		requestSchema: createGeminiRequestSchema(browserToolEnabled),
		snapshotId,
		async prepareSandbox({ request, parsed, sandbox }): Promise<void> {
			if (!browserToolEnabled) {
				return;
			}
			if (!browserToolRelayUrl) {
				throw new Error("browserTool.relayUrl is empty.");
			}

			const oidcToken =
				extractTokenFromRequest(request) ?? process.env.VERCEL_OIDC_TOKEN ?? "";
			if (!oidcToken) {
				throw new Error(
					"Planner authentication is required: set OIDC token in x-vercel-oidc-token or VERCEL_OIDC_TOKEN.",
				);
			}

			assertBrowserToolRelayCredentials(parsed);

			const vercelProtectionBypass =
				process.env.VERCEL_PROTECTION_BYPASS?.trim() || undefined;
			const giselleProtectionBypass =
				process.env.GISELLE_PROTECTION_PASSWORD?.trim() || undefined;
			const bridgeTransportEnv = buildBridgeTransportEnv({
				bridgeUrl: browserToolRelayUrl,
				relaySessionId: parsed.relay_session_id,
				relayToken: parsed.relay_token,
				oidcToken,
				vercelProtectionBypass,
				giselleProtectionBypass,
			});
			await patchGeminiSettingsTransportEnv(sandbox, bridgeTransportEnv);
		},
		createCommand({ parsed }) {
			const args = [
				"--prompt",
				parsed.message,
				"--output-format",
				"stream-json",
				"--approval-mode",
				"yolo",
			];
			if (parsed.session_id) {
				args.push("--resume", parsed.session_id);
			}

			return {
				cmd: "gemini",
				args,
				env: {
					GEMINI_API_KEY: requiredEnv("GEMINI_API_KEY"),
				},
			};
		},
	};
}
