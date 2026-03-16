import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runChat } from "./chat-run";

const { sandboxCreate, sandboxGet } = vi.hoisted(() => ({
	sandboxCreate: vi.fn(),
	sandboxGet: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		create: sandboxCreate,
		get: sandboxGet,
	},
}));

const requestSchema = z.object({
	message: z.string().min(1),
	session_id: z.string().min(1).optional(),
	sandbox_id: z.string().min(1).optional(),
});

type MockRunCommandInput = {
	cmd: string;
	args?: string[];
	stdout?: {
		write: (text: string) => void;
	};
	stderr?: {
		write: (text: string) => void;
	};
};

const makeRunCommandMock = (
	options: {
		onFindArtifacts?: () => string;
		onAgentStdout?: string;
		onAgentStderr?: string;
		onAgentCommand?: (input: MockRunCommandInput) => void;
	} = {},
) =>
	vi.fn(async (input: MockRunCommandInput) => {
		const command = `${input.cmd} ${input.args?.join(" ") ?? ""}`.trim();
		if (command.startsWith("find")) {
			return {
				exitCode: 0,
				stdout: async () => options.onFindArtifacts?.() ?? "",
				stderr: async () => "",
			};
		}

		if (options.onAgentCommand) {
			options.onAgentCommand(input);
		} else {
			input.stdout?.write?.(options.onAgentStdout ?? "");
			input.stderr?.write?.(options.onAgentStderr ?? "");
		}

		return {
			exitCode: 0,
			stdout: async () => "",
			stderr: async () => "",
		};
	});

describe("runChat", () => {
	beforeEach(() => {
		sandboxCreate.mockReset();
		sandboxGet.mockReset();
	});

	it("streams sandbox event first and runs command from agent", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onAgentStdout: "assistant-output",
			onAgentStderr: "stderr-output",
		});
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_after_run" })),
		});

		const prepareSandbox = vi.fn(async () => undefined);
		const createCommand = vi.fn(() => ({
			cmd: "agent-cmd",
			args: ["--flag"],
			env: {
				AGENT_TOKEN: "token",
			},
		}));
		const controller = new AbortController();

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox,
				createCommand,
			},
			signal: controller.signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		expect(sandboxCreate).toHaveBeenCalledWith({
			source: {
				type: "snapshot",
				snapshotId: "snapshot-test",
			},
		});
		expect(body).toContain('"type":"snapshot"');
		expect(body).toContain('"snapshot_id":"snap_after_run"');
		expect(body).toContain('"type":"stderr"');
		expect(body).toContain("stderr-output");
		expect(body.indexOf('"type":"snapshot"')).toBeGreaterThan(
			body.indexOf("stderr-output"),
		);
		expect(prepareSandbox).toHaveBeenCalledTimes(1);
		expect(createCommand).toHaveBeenCalledTimes(1);
		expect(extendTimeout).toHaveBeenCalledWith(300_000);
		expect(runCommand).toHaveBeenCalledTimes(3);
		expect(body).toContain('"type":"sandbox"');
		expect(body.indexOf("assistant-output")).toBeGreaterThan(
			body.indexOf('"type":"sandbox"'),
		);
	});

	it("emits snapshot event after command completes", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onAgentStdout: "assistant-output",
			onAgentStderr: "stderr-output",
		});
		const snapshot = vi.fn(async () => ({ snapshotId: "snap_after_run" }));
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot,
		});

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		expect(snapshot).toHaveBeenCalledTimes(1);
		expect(extendTimeout).toHaveBeenCalledWith(300_000);
		expect(body).toContain('"type":"snapshot"');
		expect(body).toContain('"snapshot_id":"snap_after_run"');
		expect(body.indexOf('"type":"snapshot"')).toBeGreaterThan(
			body.indexOf("stderr-output"),
		);
		expect(body).not.toContain('"type":"artifact"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("uses Sandbox.get when sandbox_id is provided", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock();
		sandboxGet.mockResolvedValue({
			sandboxId: "existing-sandbox",
			status: "running",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_from_existing" })),
		});
		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-unused",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
				sandbox_id: "existing-sandbox",
			},
		});
		await response.text();

		expect(sandboxGet).toHaveBeenCalledWith({ sandboxId: "existing-sandbox" });
		expect(sandboxCreate).not.toHaveBeenCalled();
		expect(extendTimeout).toHaveBeenCalledWith(300_000);
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("falls back to Sandbox.create when Sandbox.get fails and snapshot is available", async () => {
		const runCommandFromGet = vi.fn(async () => undefined);
		const extendTimeout = vi.fn(async () => undefined);
		const runCommandFromCreate = makeRunCommandMock({
			onAgentStdout: "",
			onAgentStderr: "",
		});
		const getError = new Error("sandbox expired");
		sandboxGet.mockRejectedValue(getError);
		sandboxCreate.mockResolvedValue({
			sandboxId: "recreated-sandbox",
			extendTimeout,
			runCommand: runCommandFromCreate,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_from_recreated" })),
		});

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-fallback",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
				sandbox_id: "expired-sandbox",
			},
		});
		const body = await response.text();

		expect(sandboxGet).toHaveBeenCalledWith({ sandboxId: "expired-sandbox" });
		expect(sandboxCreate).toHaveBeenCalledWith({
			source: {
				type: "snapshot",
				snapshotId: "snapshot-fallback",
			},
		});
		expect(runCommandFromGet).not.toHaveBeenCalled();
		expect(runCommandFromCreate).toHaveBeenCalledTimes(3);
		expect(extendTimeout).toHaveBeenCalledWith(300_000);
		expect(body).toContain('"type":"sandbox"');
		expect(body).toContain('"sandbox_id":"recreated-sandbox"');
		expect(body).toContain('"type":"snapshot"');
		expect(body).toContain('"snapshot_id":"snap_from_recreated"');
		expect(body).not.toContain('"type":"artifact"');
	});

	it("aborts immediately when signal is already aborted", async () => {
		const prepareSandbox = vi.fn(async () => undefined);

		const controller = new AbortController();
		controller.abort();

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox,
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: controller.signal,
			input: {
				message: "hello",
			},
		});
		await response.text();

		expect(prepareSandbox).not.toHaveBeenCalled();
		expect(sandboxCreate).not.toHaveBeenCalled();
	});

	it("uses agent-provided stdout mapper when present", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onAgentCommand: (input) => {
				input.stdout?.write?.(
					'{"type":"session.created","id":"session-1","model":"codex-small"}\n',
				);
				input.stdout?.write?.("ignored raw output");
			},
		});
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_after_run" })),
		});

		const prepareSandbox = vi.fn(async () => undefined);
		const createStdoutMapper = vi.fn(() => ({
			push: vi.fn((chunk) => {
				if (chunk.startsWith('{"type":"session.created"')) {
					return [
						`${JSON.stringify({
							type: "init",
							session_id: "session-1",
							modelId: "codex-small",
						})}\n`,
					];
				}
				return [];
			}),
			flush: vi.fn(() => []),
		}));
		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox,
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
				createStdoutMapper,
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		expect(createStdoutMapper).toHaveBeenCalledTimes(1);
		expect(body).toContain('"type":"init"');
		expect(body).not.toContain("ignored raw output");
		expect(body).toContain("sandbox-1");
		expect(body.indexOf('"type":"sandbox"')).toBeLessThan(
			body.indexOf('"type":"init"'),
		);
		expect(body).toContain('"type":"snapshot"');
		expect(body).not.toContain('"type":"artifact"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("flushes mapper output in finally", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onAgentStdout: "assistant-output",
		});
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_after_run" })),
		});

		const prepareSandbox = vi.fn(async () => undefined);
		const flush = vi.fn(() => [
			JSON.stringify({ type: "message", role: "assistant", content: "final" }) +
				"\n",
		]);
		const push = vi.fn(() => []);
		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox,
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
				createStdoutMapper: vi.fn(() => ({ push, flush })),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});

		const body = await response.text();

		expect(flush).toHaveBeenCalledTimes(1);
		expect(body).toContain('"type":"message"');
		expect(body).toContain('"content":"final"');
		expect(body).toContain('"type":"snapshot"');
		expect(body).not.toContain('"type":"artifact"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("does not emit artifact events when artifacts directory is missing", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onAgentStdout: "assistant-output",
		});
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_after_run" })),
		});

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		expect(body).toContain('"type":"snapshot"');
		expect(body).not.toContain('"type":"artifact"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("emits artifact events from ./artifacts", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onFindArtifacts: () =>
				`${"./artifacts/report.md"}\t${1824}\n${"./artifacts/highlights.json"}\t${512}\n`,
			onAgentStdout: "assistant-output",
		});
		const snapshot = vi.fn(async () => ({ snapshotId: "snap_after_run" }));
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot,
		});

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		const snapshotIndex = body.indexOf('"type":"snapshot"');
		const firstArtifactIndex = body.indexOf('"type":"artifact"');
		const secondArtifactIndex = body.indexOf(
			'"path":"./artifacts/highlights.json"',
		);

		expect(snapshot).toHaveBeenCalledTimes(1);
		expect(snapshotIndex).toBeGreaterThan(-1);
		expect(firstArtifactIndex).toBeGreaterThan(-1);
		expect(firstArtifactIndex).toBeLessThan(snapshotIndex);
		expect(secondArtifactIndex).toBeGreaterThan(firstArtifactIndex);
		expect(body).toContain('"path":"./artifacts/report.md"');
		expect(body).toContain('"size_bytes":1824');
		expect(body).toContain('"mime_type":"text/markdown; charset=utf-8"');
		expect(body).toContain('"path":"./artifacts/highlights.json"');
		expect(body).toContain('"size_bytes":512');
		expect(body).toContain('"mime_type":"application/json; charset=utf-8"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});

	it("supports nested artifact paths and preserves event ordering", async () => {
		const extendTimeout = vi.fn(async () => undefined);
		const runCommand = makeRunCommandMock({
			onFindArtifacts: () => `${"./artifacts/sections/summary.md"}\t${1024}\n`,
			onAgentStdout: "assistant-output",
		});
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			extendTimeout,
			runCommand,
			snapshot: vi.fn(async () => ({ snapshotId: "snap_after_run" })),
		});

		const response = await runChat({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
			signal: new AbortController().signal,
			input: {
				message: "hello",
			},
		});
		const body = await response.text();

		expect(body).toContain('"type":"artifact"');
		expect(body).toContain('"path":"./artifacts/sections/summary.md"');
		expect(body).toContain('"size_bytes":1024');
		expect(body).toContain('"mime_type":"text/markdown; charset=utf-8"');
		expect(runCommand).toHaveBeenCalledTimes(3);
	});
});
