#!/usr/bin/env node

import process from "node:process";
import { buildSnapshot } from "./build-snapshot";

function printUsage() {
	const usage = `Usage:
  sandbox-agent-kit build-snapshot [options]

Options:
  --local                  Copy local files instead of npm install (monorepo only)
  --repo-root <path>       Monorepo root directory (required with --local)
  --base-snapshot-id <id>  Reuse an existing base snapshot
  --sandbox-root <path>    Sandbox working directory (default: /vercel/sandbox)
  --runtime <runtime>      Sandbox runtime (default: node24)
  --timeout-ms <ms>        Sandbox timeout in ms (default: 2700000)
  --browser-tool-version <version>  Version of @giselles-ai/browser-tool to install
  --help, -h               Show this help message
`;
	process.stderr.write(usage);
}

function parseArgs(argv: string[]) {
	const args = argv.slice(2);
	const options: Record<string, string | boolean> = {};
	let command: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--local") {
			options.local = true;
			continue;
		}

		if (arg.startsWith("--") && i + 1 < args.length) {
			const key = arg.slice(2);
			i++;
			const value = args[i];
			if (value !== undefined) {
				options[key] = value;
			}
			continue;
		}

		if (!arg.startsWith("-") && !command) {
			command = arg;
		}
	}

	return { command, options };
}

async function main() {
	const { command, options } = parseArgs(process.argv);

	if (options.help) {
		printUsage();
		process.exit(0);
	}

	if (command !== "build-snapshot") {
		printUsage();
		process.exit(command ? 1 : 1);
	}

	const isLocal = options.local === true;
	const repoRoot =
		(options["repo-root"] as string | undefined) ??
		process.env.BROWSER_TOOL_REPO_ROOT?.trim();

	if (isLocal && !repoRoot) {
		console.error("Error: --repo-root is required when --local is specified.");
		process.exit(1);
	}

	const timeoutMsRaw =
		(options["timeout-ms"] as string | undefined) ??
		process.env.BROWSER_TOOL_SNAPSHOT_TIMEOUT_MS?.trim();
	const timeoutMs = timeoutMsRaw
		? Number.parseInt(timeoutMsRaw, 10)
		: undefined;

	if (
		timeoutMs !== undefined &&
		(!Number.isFinite(timeoutMs) || timeoutMs <= 0)
	) {
		console.error(`Error: Invalid timeout-ms: ${timeoutMsRaw}`);
		process.exit(1);
	}

	try {
		await buildSnapshot({
			local: isLocal,
			repoRoot: repoRoot as string | undefined,
			baseSnapshotId:
				(options["base-snapshot-id"] as string | undefined) ??
				process.env.BASE_SNAPSHOT_ID?.trim(),
			sandboxRoot:
				(options["sandbox-root"] as string | undefined) ??
				process.env.BROWSER_TOOL_SANDBOX_ROOT?.trim(),
			runtime:
				(options.runtime as string | undefined) ??
				process.env.BROWSER_TOOL_SNAPSHOT_RUNTIME?.trim(),
			timeoutMs,
			browserToolVersion: options["browser-tool-version"] as string | undefined,
		});
	} catch {
		process.exitCode = 1;
	}
}

main().catch((err: unknown) => {
	console.error(
		`Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
	);
	process.exit(1);
});
