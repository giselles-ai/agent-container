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
