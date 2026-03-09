import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/sandbox", () => ({
	Sandbox: {
		create: vi.fn(),
	},
}));

import { Sandbox } from "@vercel/sandbox";
import { buildAgent, type SnapshotCache } from "../build";

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

function createMemoryCache(): SnapshotCache {
	const map = new Map<string, string>();
	return {
		get: async (key: string) => map.get(key) ?? null,
		set: async (key: string, value: string) => {
			map.set(key, value);
		},
	};
}

describe("buildAgent", () => {
	const savedEnv = { ...process.env };

	beforeEach(() => {
		mockCreate.mockReset();
		process.env = { ...savedEnv };
		delete process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID;
	});

	afterEach(() => {
		process.env = { ...savedEnv };
	});

	it("returns 400 for invalid body", async () => {
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
			const res = await buildAgent({ request: makeRequest(body) });
			expect(res.status).toBe(400);
		}

		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid JSON", async () => {
		const res = await buildAgent({
			request: makeRequest({ any: "ignored" }, undefined, {
				bodyText: "{invalid-json",
			}),
		});

		expect(res.status).toBe(400);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("creates a snapshot even when no files are provided", async () => {
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox();
		mockCreate.mockResolvedValue(mockSandbox);

		const res = await buildAgent({
			request: makeRequest({
				config_hash: "no_files_hash",
				agent_type: "gemini",
				files: [],
			}),
		});

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

		const res = await buildAgent({
			request: makeRequest({
				config_hash: "buffer_hash",
				agent_type: "codex",
				files: [
					{ path: "/test/a.md", content: "hello" },
					{ path: "/test/b.md", content: "world" },
				],
			}),
			baseSnapshotId: "snap_config",
		});

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
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox();
		mockCreate.mockResolvedValue(mockSandbox);

		const res = await buildAgent({
			request: makeRequest({
				config_hash: "env_preferred_hash",
				agent_type: "gemini",
				files: [],
			}),
			baseSnapshotId: "snap_config",
		});

		expect(res.status).toBe(200);
		expect(mockCreate).toHaveBeenCalledWith({
			source: { type: "snapshot", snapshotId: "snap_env" },
		});
	});

	it("returns built snapshot and cached false on miss", async () => {
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({ snapshotId: "snap_built" });
		mockCreate.mockResolvedValue(mockSandbox);

		const res = await buildAgent({
			request: makeRequest({
				config_hash: "build_miss_hash",
				agent_type: "gemini",
				files: [{ path: "/x.md", content: "abc" }],
			}),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { snapshot_id: string; cached: boolean };
		expect(body).toEqual({ snapshot_id: "snap_built", cached: false });
		expect(mockCreate).toHaveBeenCalledTimes(1);
	});

	it("returns cached snapshot on second request with same hash", async () => {
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({ snapshotId: "snap_cached" });
		mockCreate.mockResolvedValue(mockSandbox);
		const cache = createMemoryCache();

		const body = {
			config_hash: "cache_hash",
			agent_type: "gemini",
			files: [{ path: "/x", content: "1" }],
		};

		await buildAgent({ request: makeRequest(body), cache });
		const res = await buildAgent({ request: makeRequest(body), cache });
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
		const cache = createMemoryCache();

		const body = {
			config_hash: "same_hash_different_base",
			agent_type: "gemini" as const,
			files: [{ path: "/x", content: "1" }],
		};

		const resA = await buildAgent({
			request: makeRequest(body),
			baseSnapshotId: "snap_a_base",
			cache,
		});
		expect(await resA.json()).toMatchObject({
			snapshot_id: "snap_a",
			cached: false,
		});

		const resB = await buildAgent({
			request: makeRequest(body),
			baseSnapshotId: "snap_b_base",
			cache,
		});
		const result = (await resB.json()) as {
			snapshot_id: string;
			cached: boolean;
		};

		expect(result).toEqual({ snapshot_id: "snap_b", cached: false });
		expect(mockCreate).toHaveBeenCalledTimes(2);
	});

	it("returns 500 when baseSnapshotId is missing in env and config", async () => {
		const res = await buildAgent({
			request: makeRequest({
				config_hash: "missing_base_hash",
				agent_type: "gemini",
				files: [],
			}),
		});

		expect(res.status).toBe(500);
		expect(await res.json()).toEqual(
			expect.objectContaining({
				ok: false,
				message:
					"Missing base snapshot ID. Set GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID or configure build.baseSnapshotId.",
			}),
		);
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("rejects when sandbox create fails", async () => {
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		mockCreate.mockRejectedValue(new Error("create failed"));

		await expect(
			buildAgent({
				request: makeRequest({
					config_hash: "error_hash_create",
					agent_type: "gemini",
					files: [{ path: "/x", content: "1" }],
				}),
			}),
		).rejects.toThrow("create failed");
	});

	it("rejects when snapshot fails", async () => {
		process.env.GISELLE_AGENT_SANDBOX_BASE_SNAPSHOT_ID = "snap_env";
		const mockSandbox = createMockSandbox({
			snapshotSpy: vi.fn().mockRejectedValue(new Error("snapshot failed")),
		});
		mockCreate.mockResolvedValue(mockSandbox);

		await expect(
			buildAgent({
				request: makeRequest({
					config_hash: "error_hash_snapshot",
					agent_type: "gemini",
					files: [{ path: "/x", content: "1" }],
				}),
			}),
		).rejects.toThrow("snapshot failed");
	});
});
