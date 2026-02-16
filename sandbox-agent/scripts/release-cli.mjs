#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(cmd, args = [], options = {}) {
	const rendered = [cmd, ...args].join(" ");
	process.stdout.write(`\n$ ${rendered}\n`);
	execFileSync(cmd, args, {
		stdio: "inherit",
		...options,
	});
}

function getArg(name) {
	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith(`${name}=`)) {
			return arg.slice(name.length + 1);
		}
	}
	return null;
}

function hasFlag(flag) {
	return process.argv.slice(2).includes(flag);
}

const releaseType = getArg("--type") ?? "prerelease";
const preid = getArg("--preid") ?? "alpha";
const allowDirty = hasFlag("--allow-dirty");
const cliCwd = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"cli",
);

if (!allowDirty) {
	const status = execFileSync("git", ["status", "--porcelain"], {
		encoding: "utf8",
	}).trim();
	if (status.length > 0) {
		process.stderr.write(
			[
				"Error: git working tree is dirty.",
				'Commit/stash changes first, or pass "--allow-dirty".',
				"",
			].join("\n"),
		);
		process.exit(1);
	}
}

if (releaseType !== "prerelease") {
	process.stderr.write(
		'Error: only "--type=prerelease" is supported to bump alpha.N.\n',
	);
	process.exit(1);
}

run(
	"npm",
	["version", "prerelease", `--preid=${preid}`, "--no-git-tag-version"],
	{
		cwd: cliCwd,
	},
);
run("npm", ["run", "build"], { cwd: cliCwd });
run("npm", ["publish", "--access", "public", "--tag", "alpha"], {
	cwd: cliCwd,
});

process.stdout.write("\nCLI release completed.\n");
