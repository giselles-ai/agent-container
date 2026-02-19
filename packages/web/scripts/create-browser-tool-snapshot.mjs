#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Sandbox } from "@vercel/sandbox";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const SANDBOX_ROOT =
	process.env.BROWSER_TOOL_SANDBOX_ROOT?.trim() || "/vercel/sandbox";
const RUNTIME = process.env.BROWSER_TOOL_SNAPSHOT_RUNTIME?.trim() || "node24";
const TIMEOUT_MS = Number.parseInt(
	process.env.BROWSER_TOOL_SNAPSHOT_TIMEOUT_MS || "2700000",
	10,
);
const BASE_SNAPSHOT_ID = process.env.BASE_SNAPSHOT_ID?.trim() || "";
const INCLUDE_PATHS = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"tsconfig.base.json",
	"packages/browser-tool",
	"packages/sandbox-agent",
];

const SKIP_DIR_NAMES = new Set([
	"node_modules",
	"dist",
	".next",
	".git",
	".jj",
]);

function toPosixPath(inputPath) {
	return inputPath.split(path.sep).join("/");
}

async function collectFiles(targetPath, acc) {
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

async function buildUploadFileList() {
	const files = [];

	for (const relativePath of INCLUDE_PATHS) {
		const absolutePath = path.join(REPO_ROOT, relativePath);
		await collectFiles(absolutePath, files);
	}

	files.sort();
	return files;
}

async function runCommandOrThrow(sandbox, input) {
	const result = await sandbox.runCommand({
		cmd: input.cmd,
		args: input.args,
		cwd: input.cwd,
		env: input.env,
	});

	const stdout = await result.stdout().catch(() => "");
	const stderr = await result.stderr().catch(() => "");

	if (result.exitCode !== 0) {
		const errorLines = [
			`Command failed: ${input.cmd} ${(input.args || []).join(" ")}`,
			`Exit code: ${result.exitCode}`,
		];

		if (stdout.trim().length > 0) {
			errorLines.push(`stdout:\n${stdout}`);
		}

		if (stderr.trim().length > 0) {
			errorLines.push(`stderr:\n${stderr}`);
		}

		throw new Error(errorLines.join("\n\n"));
	}

	return { stdout, stderr };
}

async function main() {
	if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
		throw new Error(
			`Invalid BROWSER_TOOL_SNAPSHOT_TIMEOUT_MS: ${String(TIMEOUT_MS)}`,
		);
	}

	console.log("[snapshot] collecting local files...");
	const uploadFiles = await buildUploadFileList();

	if (uploadFiles.length === 0) {
		throw new Error("No files collected for snapshot upload.");
	}

	console.log(`[snapshot] files to upload: ${uploadFiles.length}`);

	let baseSnapshotId = BASE_SNAPSHOT_ID;

	if (baseSnapshotId) {
		console.log(`[snapshot] using existing base snapshot: ${baseSnapshotId}`);
	} else {
		console.log(
			"[snapshot] BASE_SNAPSHOT_ID not set, creating base snapshot with gemini-cli...",
		);

		const baseSandbox = await Sandbox.create({
			runtime: RUNTIME,
			timeout: TIMEOUT_MS,
		});
		console.log(`[snapshot] base sandbox created: ${baseSandbox.sandboxId}`);

		try {
			console.log("[snapshot] installing gemini cli...");
			await runCommandOrThrow(baseSandbox, {
				cmd: "npm",
				args: ["install", "-g", "@google/gemini-cli"],
			});

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
			process.exitCode = 1;
			return;
		}
	}

	console.log(
		`[snapshot] creating sandbox from base snapshot runtime=${RUNTIME} timeoutMs=${TIMEOUT_MS}...`,
	);
	const sandbox = await Sandbox.create({
		source: { type: "snapshot", snapshotId: baseSnapshotId },
		runtime: RUNTIME,
		timeout: TIMEOUT_MS,
	});

	console.log(`[snapshot] sandbox created: ${sandbox.sandboxId}`);

	try {
		const filesForSandbox = await Promise.all(
			uploadFiles.map(async (absolutePath) => {
				const relativePath = path.relative(REPO_ROOT, absolutePath);
				const content = await readFile(absolutePath);

				return {
					path: toPosixPath(path.join(SANDBOX_ROOT, relativePath)),
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
					`cd ${SANDBOX_ROOT}`,
					[
						"corepack pnpm install --no-frozen-lockfile",
						"--filter @giselles-ai/browser-tool...",
						"--filter @giselles-ai/sandbox-agent...",
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
					`cd ${SANDBOX_ROOT}`,
					"corepack pnpm --filter @giselles-ai/browser-tool run build",
				].join("\n"),
			],
		});

		console.log("[snapshot] validating artifacts...");
		await runCommandOrThrow(sandbox, {
			cmd: "bash",
			args: [
				"-lc",
				[
					"set -e",
					`test -f ${SANDBOX_ROOT}/packages/browser-tool/dist/mcp-server/index.js`,
					"which gemini",
				].join("\n"),
			],
		});

		const mcpServerDistPath = `${SANDBOX_ROOT}/packages/browser-tool/dist/mcp-server/index.js`;
		const geminiSettings = {
			security: {
				auth: {
					selectedType: "gemini-api-key",
				},
			},
			mcpServers: {
				browser_tool_relay: {
					command: "node",
					args: [mcpServerDistPath],
					cwd: SANDBOX_ROOT,
					env: {},
				},
			},
		};

		console.log("[snapshot] writing gemini settings.json...");
		await sandbox.writeFiles([
			{
				path: "/home/vercel-sandbox/.gemini/settings.json",
				content: Buffer.from(JSON.stringify(geminiSettings, null, 2)),
			},
		]);

		console.log("[snapshot] creating snapshot (sandbox will be stopped)...");
		const snapshot = await sandbox.snapshot();

		console.log("\n=== Snapshot Created ===");
		console.log(`snapshotId: ${snapshot.snapshotId}`);
		console.log(`sourceSandboxId: ${snapshot.sourceSandboxId}`);
		console.log(`status: ${snapshot.status}`);
		console.log(`createdAt: ${snapshot.createdAt.toISOString()}`);
		console.log(`expiresAt: ${snapshot.expiresAt.toISOString()}`);
		console.log("\nSet this in packages/web/.env.local:");
		console.log(`SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
	} catch (error) {
		console.error("[snapshot] failed:");
		console.error(error instanceof Error ? error.message : String(error));
		console.error(`sandboxId: ${sandbox.sandboxId}`);
		console.error("If needed, reconnect with Sandbox.get({ sandboxId }).");

		try {
			await sandbox.stop();
			console.error("[snapshot] sandbox stopped.");
		} catch {
			// Best-effort cleanup.
		}

		process.exitCode = 1;
	}
}

await main();
