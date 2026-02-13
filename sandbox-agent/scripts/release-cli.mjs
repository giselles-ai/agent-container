#!/usr/bin/env node
import { execSync } from "node:child_process";

function run(cmd, options = {}) {
	process.stdout.write(`\n$ ${cmd}\n`);
	execSync(cmd, {
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
const cliCwd = "packages/cli";

if (!allowDirty) {
	const status = execSync("git status --porcelain", {
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

run(`npm version prerelease --preid=${preid} --no-git-tag-version`, {
	cwd: cliCwd,
});
run("npm run build", { cwd: cliCwd });
run("npm publish --access public --tag alpha", { cwd: cliCwd });

process.stdout.write("\nCLI release completed.\n");
