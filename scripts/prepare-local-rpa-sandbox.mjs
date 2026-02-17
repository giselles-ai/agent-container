#!/usr/bin/env node

import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const LOCAL_SANDBOX_ROOT =
	process.env.RPA_LOCAL_SANDBOX_ROOT?.trim() ||
	path.join(REPO_ROOT, ".sandbox-local", "vercel", "sandbox");

const INCLUDE_PATHS = [
	"package.json",
	"pnpm-lock.yaml",
	"pnpm-workspace.yaml",
	"tsconfig.base.json",
	"packages/browser-tool",
];

function run(cmd, args, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd,
			stdio: "inherit",
			shell: process.platform === "win32",
		});

		child.once("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${cmd} terminated by signal ${signal}`));
				return;
			}

			if (code !== 0) {
				reject(new Error(`${cmd} ${args.join(" ")} failed with code ${code}`));
				return;
			}

			resolve(undefined);
		});
	});
}

async function assertExists(targetPath) {
	try {
		await stat(targetPath);
	} catch {
		throw new Error(`Missing expected file: ${targetPath}`);
	}
}

async function main() {
	console.log(`[local-sandbox] preparing ${LOCAL_SANDBOX_ROOT}`);

	await rm(LOCAL_SANDBOX_ROOT, { recursive: true, force: true });
	await mkdir(LOCAL_SANDBOX_ROOT, { recursive: true });

	for (const relativePath of INCLUDE_PATHS) {
		const fromPath = path.join(REPO_ROOT, relativePath);
		const toPath = path.join(LOCAL_SANDBOX_ROOT, relativePath);
		await cp(fromPath, toPath, { recursive: true });
	}

	console.log("[local-sandbox] installing dependencies...");
	await run(
		"corepack",
		[
			"pnpm",
			"install",
			"--no-frozen-lockfile",
			"--filter",
			"@giselles-ai/browser-tool...",
		],
		LOCAL_SANDBOX_ROOT,
	);

	console.log("[local-sandbox] building browser-tool (mcp-server)...");
	await run(
		"corepack",
		["pnpm", "--filter", "@giselles-ai/browser-tool", "build"],
		LOCAL_SANDBOX_ROOT,
	);

	const mcpDistPath = path.join(
		LOCAL_SANDBOX_ROOT,
		"packages/browser-tool/dist/mcp-server/index.js",
	);

	await assertExists(mcpDistPath);

	console.log("");
	console.log("Local sandbox is ready.");
	console.log(`RPA_SANDBOX_ROOT=${LOCAL_SANDBOX_ROOT}`);
	console.log(
		`MCP server path = ${LOCAL_SANDBOX_ROOT}/packages/browser-tool/dist/mcp-server/index.js`,
	);
}

await main();
