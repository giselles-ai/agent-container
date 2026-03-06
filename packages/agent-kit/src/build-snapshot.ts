import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { runCommandOrThrow } from "./sandbox-utils";

const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	".next",
	".git",
	".jj",
]);

function toPosixPath(inputPath: string) {
	return inputPath.split(path.sep).join("/");
}

async function collectFiles(targetPath: string, acc: string[]) {
	const targetStat = await stat(targetPath);

	if (targetStat.isFile()) {
		acc.push(targetPath);
		return;
	}

	if (!targetStat.isDirectory()) {
		return;
	}

	const entries = await readdir(targetPath, { withFileTypes: true });

	for (const entry of entries) {
		const absolutePath = path.join(targetPath, entry.name);

		if (entry.isDirectory()) {
			if (SKIP_DIR_NAMES.has(entry.name)) {
				continue;
			}
			await collectFiles(absolutePath, acc);
			continue;
		}

		if (entry.isFile()) {
			if (entry.name.endsWith(".tsbuildinfo")) {
				continue;
			}
			acc.push(absolutePath);
		}
	}
}

async function buildUploadFileList(
	repoRoot: string,
	includePaths: string[],
): Promise<string[]> {
	const files: string[] = [];

	for (const relativePath of includePaths) {
		const absolutePath = path.join(repoRoot, relativePath);
		await collectFiles(absolutePath, files);
	}

	files.sort();
	return files;
}

export interface BuildSnapshotOptions {
	sandboxRoot?: string;
	runtime?: string;
	timeoutMs?: number;
	baseSnapshotId?: string;
	browserToolVersion?: string;
	/**
	 * When true, copy local files into the sandbox and build from source.
	 * When false (default), install @giselles-ai/browser-tool from npm.
	 */
	local?: boolean;
	/**
	 * Required when `local` is true. The root directory of the monorepo.
	 */
	repoRoot?: string;
	/**
	 * Paths to include when `local` is true.
	 * Defaults to the standard set for this monorepo.
	 */
	localIncludePaths?: string[];
}

async function installAllAgentCLIs(sandbox: Sandbox) {
	console.log("[snapshot] installing gemini cli...");
	await runCommandOrThrow(sandbox, {
		cmd: "npm",
		args: ["install", "-g", "@google/gemini-cli"],
	});

	console.log("[snapshot] installing codex cli...");
	await runCommandOrThrow(sandbox, {
		cmd: "npm",
		args: ["install", "-g", "@openai/codex"],
	});

	console.log("[snapshot] validating agent CLIs...");
	await runCommandOrThrow(sandbox, {
		cmd: "bash",
		args: [
			"-lc",
			["set -e", "which gemini", "which codex", "codex --version"].join("\n"),
		],
	});
}

async function setupBrowserToolFromNpm(sandbox: Sandbox, version?: string) {
	const packageSpec = version
		? `@giselles-ai/browser-tool@${version}`
		: "@giselles-ai/browser-tool";

	console.log(`[snapshot] installing ${packageSpec} globally...`);
	await runCommandOrThrow(sandbox, {
		cmd: "npm",
		args: ["install", "-g", packageSpec],
	});

	console.log("[snapshot] locating mcp-server entry point...");
	const { stdout: globalRoot } = await runCommandOrThrow(sandbox, {
		cmd: "npm",
		args: ["root", "-g"],
	});
	const mcpServerPath = `${globalRoot.trim()}/@giselles-ai/browser-tool/dist/mcp-server/index.js`;

	console.log(`[snapshot] mcp-server resolved at: ${mcpServerPath}`);
	return mcpServerPath;
}

async function setupBrowserToolFromLocal(
	sandbox: Sandbox,
	sandboxRoot: string,
	repoRoot: string,
	includePaths: string[],
) {
	console.log("[snapshot] collecting local files...");
	const uploadFiles = await buildUploadFileList(repoRoot, includePaths);

	if (uploadFiles.length === 0) {
		throw new Error("No files collected for snapshot upload.");
	}

	console.log(`[snapshot] files to upload: ${uploadFiles.length}`);

	const filesForSandbox = await Promise.all(
		uploadFiles.map(async (absolutePath) => {
			const relativePath = path.relative(repoRoot, absolutePath);
			const content = await readFile(absolutePath);

			return {
				path: toPosixPath(path.join(sandboxRoot, relativePath)),
				content,
			};
		}),
	);

	console.log("[snapshot] uploading repository files...");
	await sandbox.writeFiles(filesForSandbox);

	console.log("[snapshot] preparing pnpm...");
	await runCommandOrThrow(sandbox, {
		cmd: "bash",
		args: ["-lc", ["set -e", "corepack pnpm --version"].join("\n")],
	});

	console.log("[snapshot] installing dependencies...");
	await runCommandOrThrow(sandbox, {
		cmd: "bash",
		args: [
			"-lc",
			[
				"set -e",
				`cd ${sandboxRoot}`,
				[
					"corepack pnpm install --no-frozen-lockfile",
					"--filter @giselles-ai/browser-tool...",
				].join(" "),
			].join("\n"),
		],
	});

	console.log("[snapshot] building browser-tool (mcp-server)...");
	await runCommandOrThrow(sandbox, {
		cmd: "bash",
		args: [
			"-lc",
			[
				"set -e",
				`cd ${sandboxRoot}`,
				"corepack pnpm --filter @giselles-ai/browser-tool run build",
			].join("\n"),
		],
	});

	const mcpServerPath = `${sandboxRoot}/packages/browser-tool/dist/mcp-server/index.js`;

	console.log("[snapshot] validating artifacts...");
	await runCommandOrThrow(sandbox, {
		cmd: "bash",
		args: ["-lc", `set -e\ntest -f ${mcpServerPath}`],
	});

	return mcpServerPath;
}

function writeAgentConfigs(
	sandbox: Sandbox,
	mcpServerPath: string,
	sandboxRoot: string,
) {
	const geminiSettings = {
		security: {
			auth: {
				selectedType: "gemini-api-key",
			},
		},
		mcpServers: {
			browser_tool_relay: {
				command: "node",
				args: [mcpServerPath],
				cwd: sandboxRoot,
				env: {},
			},
		},
	};

	const codexConfigToml = `[mcp_servers.browser_tool_relay]
command = "node"
args = ["${mcpServerPath}"]
cwd = "${sandboxRoot}"

[mcp_servers.browser_tool_relay.env]
`;

	return Promise.all([
		sandbox.writeFiles([
			{
				path: "/home/vercel-sandbox/.gemini/settings.json",
				content: Buffer.from(JSON.stringify(geminiSettings, null, 2)),
			},
		]),
		sandbox.writeFiles([
			{
				path: "/home/vercel-sandbox/.codex/config.toml",
				content: Buffer.from(codexConfigToml),
			},
		]),
	]);
}

const DEFAULT_LOCAL_INCLUDE_PATHS = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"tsconfig.base.json",
	"packages/browser-tool",
];

export async function buildSnapshot(options: BuildSnapshotOptions = {}) {
	const sandboxRoot = options.sandboxRoot ?? "/vercel/sandbox";
	const runtime = options.runtime ?? "node24";
	const timeoutMs = options.timeoutMs ?? 2_700_000;
	const isLocal = options.local ?? false;

	if (isLocal && !options.repoRoot) {
		throw new Error("repoRoot is required when local mode is enabled.");
	}

	let baseSnapshotId = options.baseSnapshotId ?? "";

	if (baseSnapshotId) {
		console.log(`[snapshot] using existing base snapshot: ${baseSnapshotId}`);
	} else {
		console.log(
			"[snapshot] BASE_SNAPSHOT_ID not set, creating base snapshot with all agent CLIs...",
		);

		const baseSandbox = await Sandbox.create({
			runtime,
			timeout: timeoutMs,
		});
		console.log(`[snapshot] base sandbox created: ${baseSandbox.sandboxId}`);

		try {
			await installAllAgentCLIs(baseSandbox);

			console.log("[snapshot] creating base snapshot...");
			const baseSnapshot = await baseSandbox.snapshot();
			baseSnapshotId = baseSnapshot.snapshotId;

			console.log(`[snapshot] base snapshot created: ${baseSnapshotId}`);
			console.log(
				`[snapshot] reuse with: BASE_SNAPSHOT_ID="${baseSnapshotId}"`,
			);
		} catch (error) {
			console.error("[snapshot] base snapshot creation failed:");
			console.error(error instanceof Error ? error.message : String(error));
			try {
				await baseSandbox.stop();
			} catch {
				// Best-effort cleanup.
			}
			throw error;
		}
	}

	console.log(
		`[snapshot] creating sandbox from base snapshot runtime=${runtime} timeoutMs=${timeoutMs}...`,
	);
	const sandbox = await Sandbox.create({
		source: { type: "snapshot", snapshotId: baseSnapshotId },
		runtime,
		timeout: timeoutMs,
	});

	console.log(`[snapshot] sandbox created: ${sandbox.sandboxId}`);

	try {
		let mcpServerPath: string;

		if (isLocal && options.repoRoot) {
			mcpServerPath = await setupBrowserToolFromLocal(
				sandbox,
				sandboxRoot,
				options.repoRoot,
				options.localIncludePaths ?? DEFAULT_LOCAL_INCLUDE_PATHS,
			);
		} else {
			mcpServerPath = await setupBrowserToolFromNpm(
				sandbox,
				options.browserToolVersion,
			);
		}

		console.log("[snapshot] validating agent CLIs...");
		await runCommandOrThrow(sandbox, {
			cmd: "bash",
			args: [
				"-lc",
				["set -e", "which gemini", "which codex", "codex --version"].join("\n"),
			],
		});

		console.log("[snapshot] writing agent configs...");
		await writeAgentConfigs(sandbox, mcpServerPath, sandboxRoot);

		console.log("[snapshot] creating snapshot (sandbox will be stopped)...");
		const snapshot = await sandbox.snapshot();

		console.log("\n=== Snapshot Created ===");
		console.log(`snapshotId: ${snapshot.snapshotId}`);
		console.log(`sourceSandboxId: ${snapshot.sourceSandboxId}`);
		console.log(`status: ${snapshot.status}`);
		console.log(`createdAt: ${snapshot.createdAt.toISOString()}`);
		console.log(`expiresAt: ${snapshot.expiresAt?.toISOString()}`);
		console.log("\nSet this in your .env.local:");
		console.log(`SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);

		return snapshot;
	} catch (error) {
		console.error("[snapshot] failed:");
		console.error(error instanceof Error ? error.message : String(error));
		console.error(`sandboxId: ${sandbox.sandboxId}`);

		try {
			await sandbox.stop();
			console.error("[snapshot] sandbox stopped.");
		} catch {
			// Best-effort cleanup.
		}

		throw error;
	}
}
