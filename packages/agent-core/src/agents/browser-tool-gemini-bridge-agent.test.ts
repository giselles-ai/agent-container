import type { Sandbox } from "@vercel/sandbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserToolGeminiBridgeAgent } from "./browser-tool-gemini-bridge-agent";
import { createGeminiAgent } from "./gemini-agent";

const originalEnv = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(originalEnv)) {
		process.env[key] = value;
	}
});

describe("createGeminiAgent", () => {
	it("does not require relay fields when browserTool is disabled", async () => {
		process.env.GEMINI_API_KEY = "gemini-api-key";

		const readFileToBuffer = vi.fn(async () => Buffer.from("{}"));
		const writeFiles = vi.fn(async () => undefined);
		const sandbox = {
			readFileToBuffer,
			writeFiles,
		} as unknown as Sandbox;

		const agent = createGeminiAgent({
			snapshotId: "snapshot-fixed",
		});
		expect(agent.snapshotId).toBe("snapshot-fixed");
		expect(agent.requestSchema.safeParse({ message: "hello" }).success).toBe(
			true,
		);

		await agent.prepareSandbox({
			request: new Request("https://api.example.com/agent-api/run"),
			parsed: {
				message: "hello",
			},
			sandbox,
		});

		expect(readFileToBuffer).not.toHaveBeenCalled();
		expect(writeFiles).not.toHaveBeenCalled();
	});

	it("requires relay fields when browserTool is configured", () => {
		const agent = createGeminiAgent({
			snapshotId: "snapshot-fixed",
			browserTool: {
				relayUrl: "https://relay.example.com/agent-api/relay/",
			},
		});

		const parsed = agent.requestSchema.safeParse({
			message: "hello",
		});
		expect(parsed.success).toBe(false);
	});

	it("patches MCP env with relay credentials when browserTool is configured", async () => {
		process.env.VERCEL_OIDC_TOKEN = "oidc-token";
		process.env.VERCEL_PROTECTION_BYPASS = "vercel-bypass";
		process.env.GISELLE_PROTECTION_PASSWORD = "giselle-bypass";
		process.env.GEMINI_API_KEY = "gemini-api-key";

		const readFileToBuffer = async () =>
			Buffer.from(
				JSON.stringify({
					mcpServers: {
						browser_tool_relay: {
							command: "node",
							args: ["./dist/index.js"],
							env: {
								EXISTING_KEY: "existing-value",
							},
						},
					},
				}),
			);
		let writtenFileContent = "";
		const writeFiles = async (files: { content: Buffer }[]) => {
			writtenFileContent = files[0]?.content.toString("utf8") ?? "";
		};
		const sandbox = {
			readFileToBuffer,
			writeFiles,
		} as unknown as Sandbox;

		const agent = createGeminiAgent({
			snapshotId: "snapshot-fixed",
			browserTool: {
				relayUrl: "https://relay.example.com/agent-api/relay/",
			},
		});
		expect(agent.snapshotId).toBe("snapshot-fixed");

		await agent.prepareSandbox({
			request: new Request("https://api.example.com/agent-api/run"),
			parsed: {
				message: "fill form",
				relay_session_id: "relay-session",
				relay_token: "relay-token",
			},
			sandbox,
		});

		const settings = JSON.parse(writtenFileContent);
		expect(settings.mcpServers.browser_tool_relay.env).toMatchObject({
			EXISTING_KEY: "existing-value",
			BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay",
			BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
			BROWSER_TOOL_RELAY_TOKEN: "relay-token",
			VERCEL_OIDC_TOKEN: "oidc-token",
			VERCEL_PROTECTION_BYPASS: "vercel-bypass",
			GISELLE_PROTECTION_BYPASS: "giselle-bypass",
		});

		const command = agent.createCommand({
			request: new Request("https://api.example.com/agent-api/run"),
			parsed: {
				message: "fill form",
				session_id: "gemini-session",
				relay_session_id: "relay-session",
				relay_token: "relay-token",
			},
		});
		expect(command.cmd).toBe("gemini");
		expect(command.env).toMatchObject({
			GEMINI_API_KEY: "gemini-api-key",
		});
		expect(command.args).toEqual([
			"--prompt",
			"fill form",
			"--output-format",
			"stream-json",
			"--approval-mode",
			"yolo",
			"--resume",
			"gemini-session",
		]);
	});
});

describe("createBrowserToolGeminiBridgeAgent", () => {
	it("is a compatibility wrapper over createGeminiAgent", () => {
		const agent = createBrowserToolGeminiBridgeAgent({
			snapshotId: "snapshot-fixed",
			browserToolRelayUrl: "https://relay.example.com/agent-api/relay/",
		});

		const parsed = agent.requestSchema.safeParse({
			message: "hello",
			relay_session_id: "session",
			relay_token: "token",
		});
		expect(parsed.success).toBe(true);
	});
});
