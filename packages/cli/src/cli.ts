#!/usr/bin/env node
import type { Stats } from "node:fs";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import * as TOML from "@iarna/toml";

const CONFIG_FILE = "config.toml";

function getEffectiveCwd(): string {
	return process.cwd();
}

function getConfigPathFromCandidates(): {
	cwd: string;
	configPath: string;
} | null {
	const cwd = process.cwd();
	const configPath = path.join(cwd, CONFIG_FILE);
	if (fsSyncExists(configPath)) {
		return { cwd, configPath };
	}
	return null;
}

function fsSyncExists(p: string): boolean {
	try {
		fsSync.accessSync(p);
		return true;
	} catch {
		return false;
	}
}

function printUsage() {
	const usage = `Usage:
  @giselles-ai/agent create
  @giselles-ai/agent add-skill <path>
  @giselles-ai/agent edit-setup-script
`;
	process.stderr.write(usage);
}

function fail(message: string): never {
	process.stderr.write(`Error: ${message}\n`);
	process.exit(1);
}

async function promptLine(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

async function readStdinAll(): Promise<string> {
	let data = "";
	for await (const chunk of process.stdin) {
		data += chunk;
	}
	return data;
}

function validateAgentName(name: string) {
	if (!name.trim()) {
		fail("Agent name cannot be empty.");
	}
	if (name.includes("/") || name.includes("\\") || name.includes("..")) {
		fail("Agent name cannot include path separators or '..'.");
	}
}

async function ensureConfigInCwd() {
	const found = getConfigPathFromCandidates();
	if (!found) {
		fail(`No ${CONFIG_FILE} found in the current directory.`);
	}
	const { configPath, cwd } = found;
	let content: string;
	try {
		content = await fs.readFile(configPath, "utf8");
	} catch {
		fail(`No ${CONFIG_FILE} found in the current directory.`);
	}
	let config: TOML.JsonMap;
	try {
		config = TOML.parse(content) as TOML.JsonMap;
	} catch {
		fail(`${CONFIG_FILE} is not valid TOML.`);
	}
	const version = config.version;
	if (version !== 1) {
		fail(`${CONFIG_FILE} version must be 1.`);
	}
	return { config, configPath, cwd };
}

async function writeConfig(configPath: string, config: TOML.JsonMap) {
	const output = TOML.stringify(config);
	await fs.writeFile(configPath, output, "utf8");
}

async function runCreate() {
	const name = (await promptLine("Agent name: ")).trim();
	validateAgentName(name);

	const targetDir = path.join(getEffectiveCwd(), name);
	try {
		const stat = await fs.stat(targetDir);
		if (stat) {
			fail(`Directory already exists: ${name}`);
		}
		// biome-ignore lint/suspicious/noExplicitAny: WIP
	} catch (err: any) {
		if (err?.code !== "ENOENT") {
			throw err;
		}
	}

	await fs.mkdir(targetDir, { recursive: false });
	const configPath = path.join(targetDir, CONFIG_FILE);
	const content = `version = 1\n\nname = "${name}"\n`;
	await fs.writeFile(configPath, content, "utf8");
	process.stdout.write(`Created ${targetDir}\n`);
}

function ensurePathUnderCwd(absPath: string, cwd: string): string {
	const rel = path.relative(cwd, absPath);
	if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
		fail("Path must be within the current directory.");
	}
	return rel;
}

function toPosixPath(p: string): string {
	return p.split(path.sep).join(path.posix.sep);
}

async function runAddSkill(argPath: string | undefined) {
	if (!argPath) {
		fail("Path is required. Usage: add-skill <path>");
	}
	const { config, configPath, cwd } = await ensureConfigInCwd();
	const absPath = path.resolve(cwd, argPath);
	const relPath = ensurePathUnderCwd(absPath, cwd);

	let stat: Stats;
	try {
		stat = await fs.stat(absPath);
	} catch {
		fail("Path does not exist.");
	}
	if (!stat.isDirectory()) {
		fail("Path must be a directory.");
	}

	const normalizedRelPath = toPosixPath(relPath);
	const skills = Array.isArray(config.skills) ? config.skills : [];
	const already = skills.some(
		(s) => (s as TOML.JsonMap)?.path === normalizedRelPath,
	);
	if (already) {
		process.stdout.write("Skill already exists in config.\n");
		return;
	}
	config.skills = [...skills, { path: normalizedRelPath }];
	await writeConfig(configPath, config);
	process.stdout.write(`Added skill: ${normalizedRelPath}\n`);
}

async function runEditSetupScript() {
	const { config, configPath } = await ensureConfigInCwd();
	const setup = (config.setup ?? {}) as TOML.JsonMap;
	const existing = (setup.script ?? "") as string;

	process.stdout.write("Current setup.script (if any):\n");
	process.stdout.write("----- BEGIN -----\n");
	process.stdout.write(existing);
	if (!existing.endsWith("\n")) {
		process.stdout.write("\n");
	}
	process.stdout.write("------ END ------\n");
	process.stdout.write("Enter new setup script. End input with Ctrl+D.\n");

	const input = await readStdinAll();
	if (input.trim().length === 0) {
		process.stdout.write("No changes made.\n");
		return;
	}

	setup.script = input.replace(/\r\n/g, "\n");
	config.setup = setup;
	await writeConfig(configPath, config);
	process.stdout.write("Updated setup.script.\n");
}

async function main() {
	const [command, ...args] = process.argv.slice(2);
	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(command ? 0 : 1);
	}

	switch (command) {
		case "create":
			await runCreate();
			break;
		case "add-skill":
			await runAddSkill(args[0]);
			break;
		case "edit-setup-script":
			await runEditSetupScript();
			break;
		default:
			printUsage();
			process.exit(1);
	}
}

main().catch((err) => {
	process.stderr.write(`Unexpected error: ${err?.message ?? String(err)}\n`);
	process.exit(1);
});
