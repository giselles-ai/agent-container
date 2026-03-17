import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createVercelBlobStorageAdapter,
	VercelBlobStorageAdapter,
	type VercelBlobStorageAdapterOptions,
} from "../adapters/vercel-blob";
import { buildManifest, hashContent } from "../manifest";
import type { WorkspacePayload } from "../types";

const workspaceState = new Map<string, string>();
const putMock = vi.fn();
const listMock = vi.fn();

vi.mock("@vercel/blob", () => ({
	put: putMock,
	list: listMock,
	del: vi.fn(),
}));

function mockBlobUrl(pathname: string): string {
	return `blob://${pathname}`;
}

function toWorkspacePayload(path: string, content: string): WorkspacePayload {
	const fileContent = new TextEncoder().encode(content);
	const manifest = buildManifest(
		[{ path, content: fileContent }],
		new Date("2026-03-17T00:00:00Z"),
	);

	return {
		manifest: {
			...manifest,
			version: 5,
		},
		files: [
			{
				path,
				size: fileContent.byteLength,
				hash: hashContent(fileContent),
				content: fileContent,
			},
		],
	};
}

function installFetchStub(): void {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
		const requestInput = input as string | URL | Request;
		const inputUrl =
			typeof requestInput === "string" || requestInput instanceof URL
				? requestInput
				: requestInput.url;
		const rawUrl = String(inputUrl);
		const pathname = rawUrl.replace(/^blob:\/\//, "");
		const text = workspaceState.get(pathname);
		if (!text) {
			return new Response(null, { status: 404, statusText: "not found" });
		}

		return new Response(text, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	});
}

beforeEach(() => {
	workspaceState.clear();
	putMock.mockReset();
	listMock.mockReset();
	installFetchStub();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("VercelBlobStorageAdapter", () => {
	it("persists and loads manifest + files via blob state", async () => {
		const payload = toWorkspacePayload("notes.md", "hello\nfrom blob");
		putMock.mockImplementation(async (pathname: string, body: string) => {
			workspaceState.set(pathname, body);
			return { url: mockBlobUrl(pathname), pathname };
		});

		listMock.mockImplementation(async ({ prefix }) => ({
			blobs: [...workspaceState.entries()]
				.filter(([pathname]) => pathname.startsWith(prefix ?? ""))
				.map(([pathname]) => ({
					pathname,
					url: mockBlobUrl(pathname),
				})),
		}));

		const adapter = createVercelBlobStorageAdapter({
			token: "test-token",
		});

		const saved = await adapter.saveWorkspace("repo/vercel-blob", payload);

		expect(saved.key).toBe("repo/vercel-blob");
		expect(saved.version).toBe(5);
		expect(saved.updatedAt).toEqual(new Date("2026-03-17T00:00:00Z"));
		expect(putMock).toHaveBeenCalledWith(
			"sandbox-volume/repo/vercel-blob/workspace-state.json",
			expect.any(String),
			expect.objectContaining({
				access: "public",
				token: "test-token",
			}),
		);

		const loaded = await adapter.loadWorkspace("repo/vercel-blob");
		expect(loaded).not.toBeNull();
		expect(loaded?.manifest.version).toBe(5);
		expect(loaded?.manifest.updatedAt).toEqual(
			new Date("2026-03-17T00:00:00Z"),
		);
		expect(loaded?.files).toEqual([
			{
				path: "notes.md",
				size: payload.files[0].size,
				hash: payload.files[0].hash,
				content: expect.any(Uint8Array),
			},
		]);
		expect(new TextDecoder().decode(loaded?.files[0]?.content)).toBe(
			"hello\nfrom blob",
		);
	});

	it("returns null when no workspace state exists", async () => {
		listMock.mockResolvedValue({ blobs: [] });

		const adapter = createVercelBlobStorageAdapter();
		const loaded = await adapter.loadWorkspace("repo/missing");

		expect(loaded).toBeNull();
	});

	it("uses env token fallback when token option is omitted", async () => {
		const payload = toWorkspacePayload("notes.md", "fallback token");
		process.env.BLOB_READ_WRITE_TOKEN = "env-token";
		try {
			putMock.mockImplementation(async (pathname: string, body: string) => {
				workspaceState.set(pathname, body);
				return { url: mockBlobUrl(pathname), pathname };
			});

			listMock.mockResolvedValue({ blobs: [] });

			const adapter = new VercelBlobStorageAdapter();
			await adapter.saveWorkspace("repo/env-token", payload);

			expect(putMock).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(String),
				expect.objectContaining({
					token: "env-token",
				}),
			);
		} finally {
			delete process.env.BLOB_READ_WRITE_TOKEN;
		}
	});

	it("supports namespace option for state path isolation", async () => {
		const payload = toWorkspacePayload("notes.md", "namespaced");
		putMock.mockImplementation(async (pathname: string, body: string) => {
			workspaceState.set(pathname, body);
			return { url: mockBlobUrl(pathname), pathname };
		});
		listMock.mockImplementation(async ({ prefix }) => ({
			blobs: [...workspaceState.entries()]
				.filter(([pathname]) => pathname.startsWith(prefix ?? ""))
				.map(([pathname]) => ({
					pathname,
					url: mockBlobUrl(pathname),
				})),
		}));

		const options = {
			namespace: "team-workspace",
		} satisfies VercelBlobStorageAdapterOptions;
		const adapter = createVercelBlobStorageAdapter(options);

		await adapter.saveWorkspace("repo/isolated", payload);

		expect(putMock).toHaveBeenCalledWith(
			"team-workspace/repo/isolated/workspace-state.json",
			expect.any(String),
			expect.any(Object),
		);
	});
});
