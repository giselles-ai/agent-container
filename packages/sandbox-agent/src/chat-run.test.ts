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

describe("runChat", () => {
	beforeEach(() => {
		sandboxCreate.mockReset();
		sandboxGet.mockReset();
	});

	it("streams sandbox event first and runs command from agent", async () => {
		const runCommand = vi.fn(
			async (input: {
				stdout: { write: (text: string) => void };
				stderr: { write: (text: string) => void };
			}) => {
				input.stdout.write("assistant-output");
				input.stderr.write("stderr-output");
			},
		);
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			runCommand,
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
		expect(prepareSandbox).toHaveBeenCalledTimes(1);
		expect(createCommand).toHaveBeenCalledTimes(1);
		expect(runCommand).toHaveBeenCalledTimes(1);
		expect(body).toContain('"type":"sandbox"');
		expect(body.indexOf("assistant-output")).toBeGreaterThan(
			body.indexOf('"type":"sandbox"'),
		);
		expect(body).toContain('"type":"stderr"');
		expect(body).toContain("stderr-output");
	});

	it("uses Sandbox.get when sandbox_id is provided", async () => {
		const runCommand = vi.fn(async () => undefined);
		sandboxGet.mockResolvedValue({
			sandboxId: "existing-sandbox",
			runCommand,
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
		const runCommand = vi.fn(
			async (input: {
				stdout: { write: (text: string) => void };
				stderr: { write: (text: string) => void };
			}) => {
				input.stdout.write(
					'{"type":"session.created","id":"session-1","model":"codex-small"}\n',
				);
				input.stdout.write("ignored raw output");
			},
		);
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			runCommand,
		});

		const prepareSandbox = vi.fn(async () => undefined);
		const createStdoutMapper = vi.fn(() => ({
			push: vi
				.fn((chunk) => {
					if (chunk.startsWith('{"type":"session.created"')) {
						return [
							JSON.stringify({
								type: "init",
								session_id: "session-1",
								modelId: "codex-small",
							}) + "\n",
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
	});

	it("flushes mapper output in finally", async () => {
		const runCommand = vi.fn(async () => undefined);
		sandboxCreate.mockResolvedValue({
			sandboxId: "sandbox-1",
			runCommand,
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
	});
});
