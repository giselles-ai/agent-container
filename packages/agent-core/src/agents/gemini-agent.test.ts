import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { createGeminiAgent } from "./gemini-agent";

describe("createGeminiAgent", () => {
	it("does not require relay fields when tools.browser is disabled", async () => {
		const readFileToBuffer = async () => Buffer.from("{}");
		const writeFiles = async () => undefined;
		const sandbox = {
			readFileToBuffer,
			writeFiles,
		} as unknown as Sandbox;

		const agent = createGeminiAgent({
			snapshotId: "snapshot-fixed",
			env: {
				GEMINI_API_KEY: "gemini-api-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-fixed",
			},
		});
		expect(agent.snapshotId).toBe("snapshot-fixed");
		expect(agent.requestSchema.safeParse({ message: "hello" }).success).toBe(
			true,
		);

		await agent.prepareSandbox({
			input: {
				message: "hello",
			},
			sandbox,
		});
	});

	it("requires relay fields in request schema when browser tool is configured", () => {
		const agent = createGeminiAgent({
			snapshotId: "snapshot-fixed",
			env: {
				GEMINI_API_KEY: "gemini-api-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-fixed",
				BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
				BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
				BROWSER_TOOL_RELAY_TOKEN: "relay-token",
			},
			tools: {
				browser: {
					relayUrl: "https://relay.example.com/agent-api/relay/",
				},
			},
		});
		const parsed = agent.requestSchema.safeParse({
			message: "hello",
		});
		expect(parsed.success).toBe(false);
	});

	it("fails fast when browser transport env is incomplete", () => {
		expect(() =>
			createGeminiAgent({
				snapshotId: "snapshot-fixed",
				env: {
					GEMINI_API_KEY: "gemini-api-key",
					SANDBOX_SNAPSHOT_ID: "snapshot-fixed",
					BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
				},
				tools: {
					browser: {
						relayUrl: "https://relay.example.com/agent-api/relay/",
					},
				},
			}),
		).toThrow(/Missing required environment variable/);
	});

	it("patches MCP env with relay credentials and command env via provided env", async () => {
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
			env: {
				GEMINI_API_KEY: "gemini-api-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-fixed",
				BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
				BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
				BROWSER_TOOL_RELAY_TOKEN: "relay-token",
				VERCEL_OIDC_TOKEN: "oidc-token",
				VERCEL_PROTECTION_BYPASS: "vercel-bypass",
				GISELLE_PROTECTION_PASSWORD: "giselle-bypass",
			},
			tools: {
				browser: {
					relayUrl: "https://relay.example.com/agent-api/relay/",
				},
			},
		});

		await agent.prepareSandbox({
			input: {
				message: "fill form",
				relay_session_id: "relay-session",
				relay_token: "relay-token",
			},
			sandbox,
		});

		const settings = JSON.parse(writtenFileContent);
		expect(settings.mcpServers.browser_tool_relay.env).toMatchObject({
			EXISTING_KEY: "existing-value",
			BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
			BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
			BROWSER_TOOL_RELAY_TOKEN: "relay-token",
			VERCEL_OIDC_TOKEN: "oidc-token",
			VERCEL_PROTECTION_BYPASS: "vercel-bypass",
			GISELLE_PROTECTION_PASSWORD: "giselle-bypass",
		});

		const command = agent.createCommand({
			input: {
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
