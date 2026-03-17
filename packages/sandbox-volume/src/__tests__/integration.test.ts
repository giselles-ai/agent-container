import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";

import { createMemoryStorageAdapter } from "../adapters/memory";
import { SandboxVolume } from "../sandbox-volume";

type MockCommandResult = {
	exitCode: number;
	stdout: () => Promise<string>;
};

type MockSandbox = {
	mkdirCalls: string[];
	writtenFiles: Array<{ path: string; content: Buffer }>;
	mkDir: (path: string) => Promise<void>;
	writeFiles: (
		files: Array<{ path: string; content: Buffer }>,
	) => Promise<void>;
	runCommand: (command: string, args: string[]) => Promise<MockCommandResult>;
	readFileToBuffer: (file: { path: string }) => Promise<Buffer | null>;
	setFileState: (state: Record<string, string>) => void;
};

function createMockSandbox(): MockSandbox {
	const fileContents = new Map<string, Buffer>();
	const filePaths: string[] = [];
	const mkdirCalls: string[] = [];
	const writtenFiles: Array<{ path: string; content: Buffer }> = [];

	return {
		mkdirCalls,
		writtenFiles,
		async mkDir(path) {
			mkdirCalls.push(path);
		},
		async writeFiles(files) {
			writtenFiles.push(...files);
			for (const file of files) {
				fileContents.set(file.path, Buffer.from(file.content));
				if (!filePaths.includes(file.path)) {
					filePaths.push(file.path);
				}
			}
		},
		async runCommand(command, args) {
			if (command !== "bash" || args[0] !== "-lc") {
				throw new Error("unexpected command");
			}

			return {
				exitCode: 0,
				stdout: async () => filePaths.join("\0"),
			};
		},
		async readFileToBuffer({ path }) {
			return fileContents.get(path) ?? null;
		},
		setFileState(state) {
			fileContents.clear();
			filePaths.length = 0;
			for (const [path, content] of Object.entries(state)) {
				fileContents.set(path, Buffer.from(content));
				filePaths.push(path);
			}
		},
	};
}

describe("memory adapter integration", () => {
	it("persists files across transactions and preserves deletions", async () => {
		const adapter = createMemoryStorageAdapter();
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/integration",
		});

		const firstSandbox = createMockSandbox();
		await volume.mount(firstSandbox as unknown as Sandbox, async () => {
			firstSandbox.setFileState({
				"/workspace/src/index.ts": "console.log('first')",
			});
		});

		const secondSandbox = createMockSandbox();
		const tx2 = await volume.begin(secondSandbox as unknown as Sandbox);

		expect(secondSandbox.mkdirCalls).toEqual(["/workspace"]);
		expect(secondSandbox.writtenFiles).toHaveLength(1);
		expect(secondSandbox.writtenFiles[0]?.path).toBe("/workspace/src/index.ts");

		secondSandbox.setFileState({});
		const secondCommit = await tx2.commit();
		await tx2.close();

		expect(secondCommit.committed).toBe(true);
		expect(secondCommit.diff.kind).toBe("delete");

		const thirdSandbox = createMockSandbox();
		const tx3 = await volume.begin(thirdSandbox as unknown as Sandbox);

		expect(thirdSandbox.mkdirCalls).toEqual(["/workspace"]);
		expect(thirdSandbox.writtenFiles).toHaveLength(0);

		await tx3.close();
	});

	it("persists only filtered paths across multiple transactions", async () => {
		const adapter = createMemoryStorageAdapter();
		const volume = await SandboxVolume.create({
			adapter,
			key: "repo/include-exclude",
			include: ["src/**", "package.json"],
			exclude: ["src/generated/**"],
		});

		const firstSandbox = createMockSandbox();
		await volume.mount(firstSandbox as unknown as Sandbox, async () => {
			firstSandbox.setFileState({
				"/workspace/package.json": '{"name":"include-exclude"}',
				"/workspace/src/index.ts": "console.log('first')",
				"/workspace/src/generated/tmp.ts": "ignored",
				"/workspace/README.md": "should be ignored",
			});
		});

		const firstState = adapter.store.get("repo/include-exclude");
		expect(firstState).toBeDefined();
		expect(firstState?.files.map((entry) => entry.path).sort()).toEqual([
			"package.json",
			"src/index.ts",
		]);

		const secondSandbox = createMockSandbox();
		const tx2 = await volume.begin(secondSandbox as unknown as Sandbox);
		expect(secondSandbox.mkdirCalls).toEqual(["/workspace"]);
		expect(secondSandbox.writtenFiles.map((file) => file.path).sort()).toEqual([
			"/workspace/package.json",
			"/workspace/src/index.ts",
		]);

		secondSandbox.setFileState({
			"/workspace/package.json": '{"name":"include-exclude","version":1}',
			"/workspace/src/index.ts": "console.log('second')",
			"/workspace/src/new.ts": "created",
			"/workspace/src/generated/tmp.ts": "still ignored",
		});

		const secondCommit = await tx2.commit();
		expect(secondCommit.committed).toBe(true);
		expect(
			secondCommit.diff.changes.map((change) => change.path).sort(),
		).toEqual(["package.json", "src/index.ts", "src/new.ts"]);
		expect(
			secondCommit.diff.changes.some((change) =>
				change.path.startsWith("src/generated/"),
			),
		).toBe(false);

		const secondState = adapter.store.get("repo/include-exclude");
		expect(secondState).toBeDefined();
		expect(secondState?.files.map((entry) => entry.path).sort()).toEqual([
			"package.json",
			"src/index.ts",
			"src/new.ts",
		]);

		await tx2.close();

		const thirdSandbox = createMockSandbox();
		const tx3 = await volume.begin(thirdSandbox as unknown as Sandbox);
		thirdSandbox.setFileState({
			"/workspace/package.json": '{"name":"include-exclude","version":1}',
			"/workspace/src/new.ts": "created",
		});

		const thirdCommit = await tx3.commit();
		expect(thirdCommit.committed).toBe(true);
		expect(thirdCommit.diff.kind).toBe("delete");
		expect(thirdCommit.diff.changes).toEqual([
			{
				kind: "delete",
				path: "src/index.ts",
				hash: expect.any(String),
				size: expect.any(Number),
				lastSeenAt: expect.any(Date),
			},
		]);

		const thirdState = adapter.store.get("repo/include-exclude");
		expect(thirdState).toBeDefined();
		expect(thirdState?.files.map((entry) => entry.path).sort()).toEqual([
			"package.json",
			"src/new.ts",
		]);

		await tx3.close();
	});

	it("keeps out-of-scope historical entries until a scoped commit rewrites state", async () => {
		const adapter = createMemoryStorageAdapter();
		const allFilesKey = "repo/filter-caveat";
		const sourceVolume = await SandboxVolume.create({
			adapter,
			key: allFilesKey,
		});

		const bootstrapSandbox = createMockSandbox();
		await sourceVolume.mount(
			bootstrapSandbox as unknown as Sandbox,
			async () => {
				bootstrapSandbox.setFileState({
					"/workspace/package.json": '{"name":"caveat"}',
					"/workspace/src/index.ts": "console.log('kept')",
					"/workspace/dist/out.js": "old artifact",
				});
			},
		);

		const seeded = adapter.store.get(allFilesKey);
		expect(seeded).toBeDefined();
		expect(seeded?.files.map((entry) => entry.path).sort()).toEqual([
			"dist/out.js",
			"package.json",
			"src/index.ts",
		]);

		const scopedVolume = await SandboxVolume.create({
			adapter,
			key: allFilesKey,
			include: ["src/**", "package.json"],
			exclude: ["dist/**"],
		});
		const scopedSandbox = createMockSandbox();
		const scopedTx = await scopedVolume.begin(
			scopedSandbox as unknown as Sandbox,
		);
		scopedSandbox.setFileState({
			"/workspace/package.json": '{"name":"caveat"}',
			"/workspace/src/index.ts": "console.log('kept')",
		});

		const result = await scopedTx.commit();
		expect(result.committed).toBe(false);
		expect(result.diff).toEqual({
			key: allFilesKey,
			kind: "no-op",
			changes: [],
		});

		const unchangedState = adapter.store.get(allFilesKey);
		expect(unchangedState).toBeDefined();
		expect(unchangedState?.files.map((entry) => entry.path).sort()).toEqual([
			"dist/out.js",
			"package.json",
			"src/index.ts",
		]);

		await scopedTx.close();
	});
});
