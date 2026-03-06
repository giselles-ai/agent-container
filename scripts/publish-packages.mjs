#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const configPath = path.join(rootDir, "scripts", "publish-packages.json");
const versionFields = ["dependencies", "devDependencies", "peerDependencies"];
const versionBumps = new Set(["patch", "minor", "major"]);

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}

function readConfig() {
	const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	if (!Array.isArray(config.packages) || config.packages.length === 0) {
		fail(`No publish packages defined in ${configPath}.`);
	}
	return config.packages.map((entry) => {
		if (typeof entry.name !== "string" || typeof entry.dir !== "string") {
			fail(`Invalid package entry in ${configPath}.`);
		}
		return {
			name: entry.name,
			dir: entry.dir,
			dirPath: path.join(rootDir, entry.dir),
			packageJsonPath: path.join(rootDir, entry.dir, "package.json"),
			packageJsonRelativePath: path.posix.join(entry.dir, "package.json"),
		};
	});
}

function readPackageJson(packageEntry) {
	const packageJson = JSON.parse(
		fs.readFileSync(packageEntry.packageJsonPath, "utf8"),
	);
	if (packageJson.name !== packageEntry.name) {
		fail(
			[
				`Package config mismatch for ${packageEntry.packageJsonRelativePath}.`,
				`Expected ${packageEntry.name}, found ${packageJson.name}.`,
			].join(" "),
		);
	}
	return packageJson;
}

function writePackageJson(packageEntry, packageJson) {
	fs.writeFileSync(
		packageEntry.packageJsonPath,
		`${JSON.stringify(packageJson, null, "\t")}\n`,
	);
}

function loadPackages() {
	return readConfig().map((packageEntry) => ({
		...packageEntry,
		packageJson: readPackageJson(packageEntry),
	}));
}

function parseVersion(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		fail(`Unsupported version format: ${version}`);
	}
	return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
	const leftParts = parseVersion(left);
	const rightParts = parseVersion(right);
	for (let index = 0; index < leftParts.length; index += 1) {
		if (leftParts[index] > rightParts[index]) return 1;
		if (leftParts[index] < rightParts[index]) return -1;
	}
	return 0;
}

function bumpVersion(version, bump) {
	const [major, minor, patch] = parseVersion(version);
	if (bump === "major") return `${major + 1}.0.0`;
	if (bump === "minor") return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

function getSharedVersion(packages) {
	const versions = [...new Set(packages.map((pkg) => pkg.packageJson.version))];
	if (versions.length !== 1) {
		fail(
			`Publish packages must share a version, found: ${versions.join(", ")}`,
		);
	}
	return versions[0];
}

function getNextSharedVersion(packages, bump) {
	if (!versionBumps.has(bump)) {
		fail(`Expected one of ${[...versionBumps].join(", ")}, got: ${bump}`);
	}
	const baseVersion = packages
		.map((pkg) => pkg.packageJson.version)
		.sort(compareVersions)
		.at(-1);
	return bumpVersion(baseVersion, bump);
}

function getVersionMap(packages) {
	return new Map(
		packages.map((pkg) => [pkg.packageJson.name, pkg.packageJson.version]),
	);
}

function rewriteWorkspaceDeps(packages, nextVersionFor) {
	for (const pkg of packages) {
		let changed = false;
		for (const versionField of versionFields) {
			const deps = pkg.packageJson[versionField];
			if (!deps) continue;
			for (const [depName, currentVersion] of Object.entries(deps)) {
				const nextVersion = nextVersionFor(depName, currentVersion);
				if (!nextVersion || nextVersion === currentVersion) continue;
				deps[depName] = nextVersion;
				changed = true;
			}
		}
		if (changed) {
			writePackageJson(pkg, pkg.packageJson);
		}
	}
}

function run(cmd, args, options = {}) {
	const rendered = [cmd, ...args].join(" ");
	process.stdout.write(`$ ${rendered}\n`);
	execFileSync(cmd, args, {
		stdio: "inherit",
		...options,
	});
}

function bumpAllPackages(bump) {
	const packages = loadPackages();
	const nextVersion = getNextSharedVersion(packages, bump);
	for (const pkg of packages) {
		pkg.packageJson.version = nextVersion;
		writePackageJson(pkg, pkg.packageJson);
	}
	process.stdout.write(`${nextVersion}\n`);
}

function resolveWorkspaceDeps() {
	const packages = loadPackages();
	const versions = getVersionMap(packages);
	rewriteWorkspaceDeps(packages, (depName, currentVersion) => {
		if (!currentVersion.startsWith("workspace:")) return null;
		return versions.get(depName) ?? null;
	});
}

function restoreWorkspaceDeps() {
	const packages = loadPackages();
	const versions = getVersionMap(packages);
	rewriteWorkspaceDeps(packages, (depName, currentVersion) => {
		if (!versions.has(depName)) return null;
		return currentVersion === versions.get(depName) ? "workspace:*" : null;
	});
}

function publishPackages() {
	for (const pkg of loadPackages()) {
		run("npm", ["publish", "--provenance", "--access", "public"], {
			cwd: pkg.dirPath,
		});
	}
}

function printPackageJsonPaths() {
	for (const pkg of readConfig()) {
		process.stdout.write(`${pkg.packageJsonRelativePath}\n`);
	}
}

const command = process.argv[2];

if (command === "bump") {
	bumpAllPackages(process.argv[3]);
	process.exit(0);
}

if (command === "resolve-workspace-deps") {
	resolveWorkspaceDeps();
	process.exit(0);
}

if (command === "restore-workspace-deps") {
	restoreWorkspaceDeps();
	process.exit(0);
}

if (command === "publish") {
	publishPackages();
	process.exit(0);
}

if (command === "release-version") {
	process.stdout.write(`${getSharedVersion(loadPackages())}\n`);
	process.exit(0);
}

if (command === "package-json-paths") {
	printPackageJsonPaths();
	process.exit(0);
}

fail(
	[
		"Usage:",
		"  node scripts/publish-packages.mjs bump <patch|minor|major>",
		"  node scripts/publish-packages.mjs resolve-workspace-deps",
		"  node scripts/publish-packages.mjs restore-workspace-deps",
		"  node scripts/publish-packages.mjs publish",
		"  node scripts/publish-packages.mjs release-version",
		"  node scripts/publish-packages.mjs package-json-paths",
	].join("\n"),
);
