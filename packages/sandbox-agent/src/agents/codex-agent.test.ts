import * as TOML from "@iarna/toml";
import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { createCodexAgent } from "./codex-agent";

describe("createCodexAgent", () => {
	it("creates agent with valid env", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		expect(agent.snapshotId).toBe("snapshot-codex");
		expect(agent.requestSchema.safeParse({ message: "hello" }).success).toBe(
			true,
		);
	});

	it("accepts CODEX_API_KEY as alternative", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				CODEX_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		const command = agent.createCommand({ input: { message: "hello" } });
		expect(command.env).toMatchObject({ OPENAI_API_KEY: "sk-test-key" });
	});

	it("throws when no API key is provided", () => {
		expect(() =>
			createCodexAgent({
				snapshotId: "snapshot-codex",
				env: {
					SANDBOX_SNAPSHOT_ID: "snapshot-codex",
				},
			}),
		).toThrow(/Missing required environment variable/);
	});

	it("generates correct command args without session_id", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		const command = agent.createCommand({
			input: { message: "build a form" },
		});
		expect(command.cmd).toBe("codex");
		expect(command.args).toEqual([
			"exec",
			"--json",
			"--yolo",
			"--skip-git-repo-check",
			"build a form",
		]);
		expect(command.env).toMatchObject({
			OPENAI_API_KEY: "sk-test-key",
		});
	});

	it("generates resume command args when session_id is provided", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		const command = agent.createCommand({
			input: {
				message: "fix the bug",
				session_id: "0199a213-81c0-7800-8aa1-bbab2a035a53",
			},
		});
		expect(command.cmd).toBe("codex");
		expect(command.args).toEqual([
			"exec",
			"resume",
			"0199a213-81c0-7800-8aa1-bbab2a035a53",
			"--json",
			"--yolo",
			"--skip-git-repo-check",
			"fix the bug",
		]);
		expect(command.env).toMatchObject({
			OPENAI_API_KEY: "sk-test-key",
		});
	});

	it("does not use resume when session_id is undefined", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		const command = agent.createCommand({
			input: { message: "hello", session_id: undefined },
		});
		expect(command.args).toEqual([
			"exec",
			"--json",
			"--yolo",
			"--skip-git-repo-check",
			"hello",
		]);
	});

	it("rejects empty message", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		expect(agent.requestSchema.safeParse({ message: "" }).success).toBe(false);
	});

	it("prepareSandbox is a no-op", async () => {
		const sandbox = {} as unknown as Sandbox;
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		await expect(
			agent.prepareSandbox({ input: { message: "hello" }, sandbox }),
		).resolves.toBeUndefined();
	});

	it("requires relay fields in request schema when browser tool is configured", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
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
		const parsed = agent.requestSchema.safeParse({ message: "hello" });
		expect(parsed.success).toBe(false);
	});

	it("fails fast when browser transport env is incomplete", () => {
		expect(() =>
			createCodexAgent({
				snapshotId: "snapshot-codex",
				env: {
					OPENAI_API_KEY: "sk-test-key",
					SANDBOX_SNAPSHOT_ID: "snapshot-codex",
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

	it("patches MCP env with relay credentials via prepareSandbox", async () => {
		const configToml = `[mcp_servers.browser_tool_relay]
command = "node"
args = ["./dist/index.js"]
cwd = "/vercel/sandbox"

[mcp_servers.browser_tool_relay.env]
EXISTING_KEY = "existing-value"
`;
		const readFileToBuffer = async () => Buffer.from(configToml);
		let writtenContent = "";
		const writeFiles = async (files: { content: Buffer }[]) => {
			writtenContent = files[0]?.content.toString("utf8") ?? "";
		};
		const sandbox = {
			readFileToBuffer,
			writeFiles,
		} as unknown as Sandbox;

		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
				BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
				BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
				BROWSER_TOOL_RELAY_TOKEN: "relay-token",
				VERCEL_OIDC_TOKEN: "oidc-token",
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

		const parsed = TOML.parse(writtenContent) as {
			mcp_servers?: Record<
				string,
				{
					env?: Record<string, string>;
				}
			>;
		};
		const serverEnv = parsed.mcp_servers?.browser_tool_relay?.env;
		expect(serverEnv).toMatchObject({
			EXISTING_KEY: "existing-value",
			BROWSER_TOOL_RELAY_URL: "https://relay.example.com/agent-api/relay/",
			BROWSER_TOOL_RELAY_SESSION_ID: "relay-session",
			BROWSER_TOOL_RELAY_TOKEN: "relay-token",
			VERCEL_OIDC_TOKEN: "oidc-token",
		});
	});

	it("provides createStdoutMapper", () => {
		const agent = createCodexAgent({
			snapshotId: "snapshot-codex",
			env: {
				OPENAI_API_KEY: "sk-test-key",
				SANDBOX_SNAPSHOT_ID: "snapshot-codex",
			},
		});
		expect(agent.createStdoutMapper).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: testing
		const mapper = agent.createStdoutMapper!();
		expect(mapper.push).toBeInstanceOf(Function);
		expect(mapper.flush).toBeInstanceOf(Function);
	});
});
