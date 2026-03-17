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
});
