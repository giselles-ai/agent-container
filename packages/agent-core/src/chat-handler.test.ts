import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createChatHandler } from "./chat-handler";

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

function createPostRequest(payload: unknown): Request {
	return new Request("https://example.com/agent-api/run", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	});
}

describe("createChatHandler", () => {
	beforeEach(() => {
		sandboxCreate.mockReset();
		sandboxGet.mockReset();
	});

	it("returns 400 for invalid payload", async () => {
		const handler = createChatHandler({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "echo",
					args: ["ok"],
				})),
			},
		});

		const response = await handler(createPostRequest({}));

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Invalid request payload.",
		});
		expect(sandboxCreate).not.toHaveBeenCalled();
		expect(sandboxGet).not.toHaveBeenCalled();
	});

	it("streams sandbox event first and runs command from agent", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing
		const runCommand = vi.fn(async (input: any) => {
			input.stdout.write("assistant-output");
			input.stderr.write("stderr-output");
		});
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

		const handler = createChatHandler({
			agent: {
				requestSchema,
				snapshotId: "snapshot-test",
				prepareSandbox,
				createCommand,
			},
		});

		const response = await handler(createPostRequest({ message: "hello" }));
		const body = await response.text();

		expect(sandboxCreate).toHaveBeenCalledWith({
			source: {
				type: "snapshot",
				snapshotId: "snapshot-test",
			},
		});
		expect(prepareSandbox).toHaveBeenCalledTimes(1);
		expect(createCommand).toHaveBeenCalledTimes(1);
		expect(runCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				cmd: "agent-cmd",
				args: ["--flag"],
				env: {
					AGENT_TOKEN: "token",
				},
			}),
		);
		expect(body.indexOf('"type":"sandbox"')).toBeGreaterThanOrEqual(0);
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
		const handler = createChatHandler({
			agent: {
				requestSchema,
				snapshotId: "snapshot-unused",
				prepareSandbox: vi.fn(async () => undefined),
				createCommand: vi.fn(() => ({
					cmd: "agent-cmd",
					args: [],
				})),
			},
		});

		const response = await handler(
			createPostRequest({
				message: "hello",
				sandbox_id: "existing-sandbox",
			}),
		);

		expect(response.status).toBe(200);
		await response.text();

		expect(sandboxGet).toHaveBeenCalledWith({ sandboxId: "existing-sandbox" });
		expect(sandboxCreate).not.toHaveBeenCalled();
	});
});
