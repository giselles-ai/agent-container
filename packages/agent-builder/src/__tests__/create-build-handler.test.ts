import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		create: vi.fn(),
	},
}));

import { Sandbox } from "@vercel/sandbox";
import { createBuildHandler } from "../next-server/create-build-handler";

const mockCreate = vi.mocked(Sandbox.create);

function makeRequest(
	body: unknown,
	token?: string,
	options?: { bodyText?: string },
): Request {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (token) {
		headers.authorization = `Bearer ${token}`;
	}

	return new Request("http://localhost/agent-api/build", {
		method: "POST",
		headers,
		body: options?.bodyText ?? JSON.stringify(body),
	});
}

function createMockSandbox(overrides?: {
	snapshotId?: string;
	writeSpy?: ReturnType<typeof vi.fn>;
	snapshotSpy?: ReturnType<typeof vi.fn>;
	// biome-ignore lint/suspicious/noExplicitAny: mock object doesn't need full Sandbox type
}): any {
	return {
		sandboxId: "sb_123",
		writeFiles: overrides?.writeSpy ?? vi.fn().mockResolvedValue(undefined),
		snapshot:
			overrides?.snapshotSpy ??
			vi
				.fn()
				.mockResolvedValue({ snapshotId: overrides?.snapshotId ?? "snap_new" }),
	};
}

describe("createBuildHandler", () => {
	const savedEnv = { ...process.env };

	beforeEach(() => {
		mockCreate.mockReset();
		process.env = { ...savedEnv };
		delete process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID;
	});

	afterEach(() => {
		process.env = { ...savedEnv };
	});

	it("returns 401 when auth is required but token is missing", async () => {
		const handler = createBuildHandler({ verifyToken: vi.fn() });
		const res = await handler(makeRequest({}));

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual(
			expect.objectContaining({
				ok: false,
				message: "Missing authorization token.",
			}),
		);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 401 when token is invalid", async () => {
		const handler = createBuildHandler({
			verifyToken: vi.fn().mockResolvedValue(false),
		});
		const res = await handler(makeRequest({}, "wrong-token"));

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toEqual(
			expect.objectContaining({
				ok: false,
				message: "Invalid authorization token.",
			}),
		);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid body", async () => {
		const handler = createBuildHandler();
		const malformed: unknown[] = [
			{},
			{ config_hash: "hash", agent_type: "gemini" },
			{
				config_hash: "hash",
				agent_type: "gemini",
				files: [{ path: "/x", content: 123 }],
			},
			"not-an-object",
			null,
			[],
		];

		for (const body of malformed) {
			const res = await handler(makeRequest(body));
			expect(res.status).toBe(400);
		}

		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid JSON", async () => {
		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({ any: "ignored" }, undefined, { bodyText: "{invalid-json" }),
		);

		expect(res.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("creates a snapshot even when no files are provided", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox();
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({
				config_hash: "no_files_hash",
				agent_type: "gemini",
				files: [],
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { snapshot_id: string; cached: boolean };
		expect(body).toEqual({ snapshot_id: "snap_new", cached: false });
		expect(mockCreate).toHaveBeenCalledTimes(1);
		expect(mockCreate).toHaveBeenCalledWith({
			source: { type: "snapshot", snapshotId: "snap_env" },
		});
		expect(mockSandbox.writeFiles).not.toHaveBeenCalled();
		expect(mockSandbox.snapshot).toHaveBeenCalledTimes(1);
	});

	it("writes file contents as Buffer before snapshotting", async () => {
		const mockSandbox = createMockSandbox();
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler({ baseSnapshotId: "snap_config" });
		const files = [
			{ path: "/test/a.md", content: "hello" },
			{ path: "/test/b.md", content: "world" },
		];
		const res = await handler(
			makeRequest({
				config_hash: "buffer_hash",
				agent_type: "codex",
				files,
			}),
		);

		expect(res.status).toBe(200);
		expect(mockCreate).toHaveBeenCalledWith({
			source: { type: "snapshot", snapshotId: "snap_config" },
		});
		expect(mockSandbox.writeFiles).toHaveBeenCalledWith([
			{ path: "/test/a.md", content: Buffer.from("hello") },
			{ path: "/test/b.md", content: Buffer.from("world") },
		]);
		expect(mockSandbox.snapshot).toHaveBeenCalledTimes(1);
	});

	it("prefers env baseSnapshotId over config", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox();
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler({ baseSnapshotId: "snap_config" });
		const res = await handler(
			makeRequest({
				config_hash: "env_preferred_hash",
				agent_type: "gemini",
				files: [],
			}),
		);

		expect(res.status).toBe(200);
		expect(mockCreate).toHaveBeenCalledWith({
			source: { type: "snapshot", snapshotId: "snap_env" },
		});
	});

	it("returns built snapshot and cached false on miss", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({ snapshotId: "snap_built" });
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({
				config_hash: "build_miss_hash",
				agent_type: "gemini",
				files: [{ path: "/x.md", content: "abc" }],
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { snapshot_id: string; cached: boolean };
		expect(body).toEqual({ snapshot_id: "snap_built", cached: false });
		expect(mockCreate).toHaveBeenCalledTimes(1);
	});

	it("returns cached snapshot on second request with same hash", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({ snapshotId: "snap_cached" });
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler();
		const body = {
			config_hash: "cache_hash",
			agent_type: "gemini",
			files: [{ path: "/x", content: "1" }],
		};

		await handler(makeRequest(body));
		const res = await handler(makeRequest(body));
		const result = (await res.json()) as {
			snapshot_id: string;
			cached: boolean;
		};

		expect(result.cached).toBe(true);
		expect(result.snapshot_id).toBe("snap_cached");
		expect(mockCreate).toHaveBeenCalledTimes(1);
	});

	it("does not reuse cache across different base snapshots", async () => {
		mockCreate
			.mockResolvedValueOnce(createMockSandbox({ snapshotId: "snap_a" }))
			.mockResolvedValueOnce(createMockSandbox({ snapshotId: "snap_b" }));

		const body = {
			config_hash: "same_hash_different_base",
			agent_type: "gemini" as const,
			files: [{ path: "/x", content: "1" }],
		};

		const handlerA = createBuildHandler({ baseSnapshotId: "snap_a_base" });
		await handlerA(makeRequest(body));

		const handlerB = createBuildHandler({ baseSnapshotId: "snap_b_base" });
		const res = await handlerB(makeRequest(body));
		const result = (await res.json()) as {
			snapshot_id: string;
			cached: boolean;
		};

		expect(result).toEqual({ snapshot_id: "snap_b", cached: false });
		expect(mockCreate).toHaveBeenCalledTimes(2);
	});

	it("returns 500 when baseSnapshotId is missing in env and config", async () => {
		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({
				config_hash: "missing_base_hash",
				agent_type: "gemini",
				files: [],
			}),
		);

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual(
			expect.objectContaining({
				ok: false,
				message:
					"Missing base snapshot ID. Set GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID or BuildHandlerConfig.baseSnapshotId.",
			}),
		);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 500 when sandbox create fails", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		mockCreate.mockRejectedValue(new Error("create failed"));

		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({
				config_hash: "error_hash_create",
				agent_type: "gemini",
				files: [{ path: "/x", content: "1" }],
			}),
		);

		expect(res.status).toBe(500);
	});

	it("returns 500 when snapshot fails", async () => {
		process.env.GISELLE_SANDBOX_AGENT_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({
			snapshotSpy: vi.fn().mockRejectedValue(new Error("snapshot failed")),
		});
		mockCreate.mockResolvedValue(mockSandbox);

		const handler = createBuildHandler();
		const res = await handler(
			makeRequest({
				config_hash: "error_hash_snapshot",
				agent_type: "gemini",
				files: [{ path: "/x", content: "1" }],
			}),
		);

		expect(res.status).toBe(500);
	});
});
