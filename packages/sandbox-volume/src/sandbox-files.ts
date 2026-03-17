import type { Sandbox } from "@vercel/sandbox";
import type { WorkspaceFileEntry } from "./adapters/types";
import { hashContent } from "./manifest";

function toAbsoluteMountPath(mountPath: string): string {
	if (!mountPath.startsWith("/")) {
		return `/${mountPath}`;
	}
	return mountPath;
}

function joinPaths(root: string, relativePath: string): string {
	const cleanRoot = root.endsWith("/") ? root.slice(0, -1) : root;
	return `${cleanRoot}/${relativePath}`;
}

export function normalizeMountPath(mountPath: string): string {
	return toAbsoluteMountPath(mountPath);
}

export async function hydrateWorkspaceFiles(
	sandbox: Sandbox,
	mountPath: string,
	files: ReadonlyArray<WorkspaceFileEntry>,
): Promise<void> {
	const normalizedMountPath = normalizeMountPath(mountPath);
	await sandbox.mkDir(normalizedMountPath);

	if (files.length === 0) {
		return;
	}

	await sandbox.writeFiles(
		files.map((file) => {
			return {
				path: joinPaths(normalizedMountPath, file.path),
				content: Buffer.from(file.content),
			};
		}),
	);
}

function toRelativeWorkspacePath(
	mountPath: string,
	absolutePath: string,
): string {
	const normalizedMountPath = normalizeMountPath(mountPath);

	if (normalizedMountPath === "/") {
		return absolutePath.replace(/^\/+/, "");
	}

	if (!absolutePath.startsWith(`${normalizedMountPath}/`)) {
		return absolutePath;
	}

	return absolutePath.slice(normalizedMountPath.length + 1);
}

export async function scanWorkspaceFilePaths(
	sandbox: Sandbox,
	mountPath: string,
): Promise<string[]> {
	const normalizedMountPath = normalizeMountPath(mountPath);

	const result = await sandbox.runCommand("bash", [
		"-lc",
		`find ${JSON.stringify(normalizedMountPath)} -type f -print0`,
	]);
	if (result.exitCode !== 0) {
		throw new Error(
			`Failed to scan workspace files under ${normalizedMountPath} (exitCode=${result.exitCode})`,
		);
	}

	const output = await result.stdout();
	if (!output) {
		return [];
	}

	return output
		.split("\0")
		.filter((path) => path.length > 0)
		.map((path) => toRelativeWorkspacePath(normalizedMountPath, path))
		.filter((path) => path.length > 0);
}

export async function collectWorkspaceFiles(
	sandbox: Sandbox,
	mountPath: string,
	filePaths: ReadonlyArray<string> = [],
): Promise<WorkspaceFileEntry[]> {
	const normalizedMountPath = normalizeMountPath(mountPath);
	const fileList =
		filePaths.length > 0
			? filePaths
			: await scanWorkspaceFilePaths(sandbox, normalizedMountPath);

	const results = await Promise.all(
		fileList.map(async (path) => {
			const sandboxPath = joinPaths(normalizedMountPath, path);
			const content = await sandbox.readFileToBuffer({ path: sandboxPath });
			if (!content) {
				return null;
			}

			return {
				path,
				content,
				size: content.byteLength,
				hash: hashContent(content),
			} satisfies WorkspaceFileEntry;
		}),
	);

	const files: WorkspaceFileEntry[] = [];
	for (const entry of results) {
		if (entry) {
			files.push(entry);
		}
	}
	return files;
}
