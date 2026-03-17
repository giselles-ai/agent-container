import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";

import type {
	StorageAdapter,
	StorageLoadResult,
	WorkspacePayload,
} from "../adapters/types";
import { buildManifest, hashContent } from "../manifest";
import { SandboxVolume } from "../sandbox-volume";

type MockReadFileArgs = {
	path: string;
};

type MockCommandResult = {
	exitCode: number;
	stdout: () => Promise<string>;
};

type MockSandbox = {
	mkdirCalls: string[];
	writtenFiles: Array<{ path: string; content: Buffer }>;
	readCalls: string[];
	filePaths: string[];
	fileContents: Map<string, Buffer>;
	setFileState: (state: Record<string, string>) => void;
	mkDir: (path: string) => Promise<void>;
	writeFiles: (
		files: Array<{ path: string; content: Buffer }>,
	) => Promise<void>;
	runCommand: (command: string, args: string[]) => Promise<MockCommandResult>;
	readFileToBuffer: (file: MockReadFileArgs) => Promise<Buffer | null>;
};

function createMockSandbox(): MockSandbox {
	const fileContents = new Map<string, Buffer>();
	const sandboxState: { filePaths: string[] } = { filePaths: [] };
	const mkdirCalls: string[] = [];
	const writtenFiles: Array<{ path: string; content: Buffer }> = [];
	const readCalls: string[] = [];

	return {
		mkdirCalls,
		writtenFiles,
		readCalls,
		filePaths: sandboxState.filePaths,
		fileContents,
		setFileState: (state) => {
			fileContents.clear();
			const nextPaths = Object.entries(state).map(([path, content]) => {
				fileContents.set(path, Buffer.from(content));
				return path;
			});
			sandboxState.filePaths = [...nextPaths];
		},
		mkDir: async (path: string) => {
			mkdirCalls.push(path);
		},
		writeFiles: async (files) => {
			writtenFiles.push(...files);
		},
		runCommand: async (command: string, args: string[]) => {
			if (command !== "bash") {
				throw new Error(`unexpected command: ${command}`);
			}
			if (!args || args[0] !== "-lc") {
				throw new Error("unexpected command args");
			}

			return {
				exitCode: 0,
				stdout: async () => sandboxState.filePaths.join("\0"),
			};
		},
		readFileToBuffer: async ({ path }) => {
			readCalls.push(path);
			return fileContents.get(path) ?? null;
		},
	};
}

type AdapterSaveSpy = {
	payload: WorkspacePayload;
	savedAt: Date;
	version: number;
};

class InMemoryAdapter implements StorageAdapter {
	public saveCalls: AdapterSaveSpy[] = [];
	private currentVersion: number;

	constructor(
		private readonly initial: StorageLoadResult | null,
		startVersion?: number,
	) {
		this.currentVersion = startVersion ?? initial?.manifest.version ?? 0;
	}

	loadWorkspace(): Promise<StorageLoadResult | null> {
		return Promise.resolve(this.initial);
	}

	saveWorkspace(
		_key: string,
		payload: WorkspacePayload,
	): Promise<{ updatedAt: Date; key: string; version: number }> {
		const nextVersion = ++this.currentVersion;
		const savedAt = new Date("2026-03-17T00:00:00Z");
		this.saveCalls.push({ payload, savedAt, version: nextVersion });
		return Promise.resolve({
			key: _key,
			version: nextVersion,
			updatedAt: savedAt,
		});
	}
}

function createWorkspaceFile(path: string, content: string) {
	const bytes = new TextEncoder().encode(content);
	return {
		path,
		content: bytes,
		size: bytes.byteLength,
		hash: hashContent(bytes),
	};
}

describe("workspace transaction commit", () => {
	it("commits modified files with update diff", async () => {
		const sandbox = createMockSandbox();
		const initialFiles = [
			createWorkspaceFile("src/index.ts", "console.log(1)"),
		];
		const adapter = new InMemoryAdapter({
			manifest: buildManifest(
				initialFiles.map(({ path, content }) => ({ path, content })),
				new Date("2026-03-17T00:00:00Z"),
			),
			files: initialFiles,
		});
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/update",
		});
		const tx = await volume.begin(sandbox as unknown as Sandbox);

		sandbox.setFileState({
			"/workspace/src/index.ts": "console.log(2)",
		});

		const result = await tx.commit();

		expect(result.committed).toBe(true);
		expect(result.diff.kind).toBe("update");
		expect(result.diff.changes).toEqual([
			{
				kind: "update",
				path: "src/index.ts",
				hash: hashContent("console.log(2)"),
				size: expect.any(Number),
				lastSeenAt: expect.any(Date),
			},
		]);
		expect(adapter.saveCalls).toHaveLength(1);
		const saveCall = adapter.saveCalls[0];
		expect(saveCall).toBeDefined();
		expect(saveCall?.payload.files).toEqual([
			{
				path: "src/index.ts",
				size: expect.any(Number),
				hash: hashContent("console.log(2)"),
				content: expect.any(Buffer),
			},
		]);
		await tx.close();
	});

	it("commits newly added files with create diff", async () => {
		const sandbox = createMockSandbox();
		const initialFiles = [
			createWorkspaceFile("src/index.ts", "console.log(1)"),
		];
		const adapter = new InMemoryAdapter({
			manifest: buildManifest(
				initialFiles.map(({ path, content }) => ({ path, content })),
				new Date("2026-03-17T00:00:00Z"),
			),
			files: initialFiles,
		});
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/create",
		});
		const tx = await volume.begin(sandbox as unknown as Sandbox);

		sandbox.setFileState({
			"/workspace/src/index.ts": "console.log(1)",
			"/workspace/src/new.ts": "new file",
		});

		const result = await tx.commit();

		expect(result.committed).toBe(true);
		expect(result.diff.kind).toBe("create");
		expect(result.diff.changes).toEqual(
			expect.arrayContaining([
				{
					kind: "create",
					path: "src/new.ts",
					hash: hashContent("new file"),
					size: 8,
					lastSeenAt: expect.any(Date),
				},
			]),
		);
		expect(adapter.saveCalls).toHaveLength(1);
		const createSaveCall = adapter.saveCalls[0];
		expect(createSaveCall).toBeDefined();
		expect(createSaveCall?.payload.files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "src/index.ts",
				}),
				expect.objectContaining({
					path: "src/new.ts",
				}),
			]),
		);
		await tx.close();
	});

	it("commits deletions", async () => {
		const sandbox = createMockSandbox();
		const initialFiles = [
			createWorkspaceFile("src/index.ts", "console.log(1)"),
			createWorkspaceFile("src/obsolete.ts", "obsolete"),
		];
		const adapter = new InMemoryAdapter({
			manifest: buildManifest(
				initialFiles.map(({ path, content }) => ({ path, content })),
				new Date("2026-03-17T00:00:00Z"),
			),
			files: initialFiles,
		});
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/delete",
		});
		const tx = await volume.begin(sandbox as unknown as Sandbox);

		sandbox.setFileState({
			"/workspace/src/index.ts": "console.log(1)",
		});

		const result = await tx.commit();

		expect(result.committed).toBe(true);
		expect(result.diff.kind).toBe("delete");
		expect(result.diff.changes).toEqual([
			{
				kind: "delete",
				path: "src/obsolete.ts",
				hash: expect.any(String),
				size: expect.any(Number),
				lastSeenAt: expect.any(Date),
			},
		]);
		expect(adapter.saveCalls).toHaveLength(1);
		const deleteSaveCall = adapter.saveCalls[0];
		expect(deleteSaveCall).toBeDefined();
		expect(deleteSaveCall?.payload.files).toEqual([
			{
				path: "src/index.ts",
				content: expect.any(Buffer),
				size: expect.any(Number),
				hash: hashContent("console.log(1)"),
			},
		]);
		await tx.close();
	});

	it("returns no-op for unchanged workspace and skips persistence", async () => {
		const sandbox = createMockSandbox();
		const initialFile = createWorkspaceFile("src/index.ts", "console.log(1)");
		const baselineManifest = {
			...buildManifest(
				[{ path: initialFile.path, content: initialFile.content }],
				new Date("2026-03-17T00:00:00Z"),
			),
			version: 9,
		};
		const adapter = new InMemoryAdapter(
			{
				manifest: baselineManifest,
				files: [initialFile],
			},
			9,
		);
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/no-op",
		});
		const tx = await volume.begin(sandbox as unknown as Sandbox);

		sandbox.setFileState({
			"/workspace/src/index.ts": "console.log(1)",
		});

		const result = await tx.commit();

		expect(result.committed).toBe(false);
		expect(result.diff).toEqual({
			key: "repo/no-op",
			kind: "no-op",
			changes: [],
		});
		expect(result.nextVersion).toBe(9);
		expect(adapter.saveCalls).toHaveLength(0);
		await tx.close();
	});
});
