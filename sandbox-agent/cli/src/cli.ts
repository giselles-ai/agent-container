#!/usr/bin/env node
import type { Stats } from "node:fs";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import * as TOML from "@iarna/toml";
import * as tar from "tar";

const CONFIG_FILE = "config.toml";
const HOSTED_SKILL_SLUG_RE = /^[a-z0-9-]+$/;

type SkillEntry = {
	source?: "local" | "hosted";
	path?: string;
	slug?: string;
};

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
  giselle create
  giselle add-skill <path>
  giselle add-hosted-skill <slug>
  giselle edit-setup-script
  giselle build
  giselle delete [slug] [--force]
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

function toSlug(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
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
	if (version === 1) {
		fail(
			`${CONFIG_FILE} version 1 is deprecated. Please migrate to version 2.`,
		);
	}
	if (version !== 2) {
		fail(`${CONFIG_FILE} version must be 2.`);
	}
	return { config, configPath, cwd };
}

async function writeConfig(configPath: string, config: TOML.JsonMap) {
	const output = TOML.stringify(config);
	await fs.writeFile(configPath, output, "utf8");
}

async function listFilesRecursively(rootPath: string): Promise<string[]> {
	const entries = await fs.readdir(rootPath, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const fullPath = path.join(rootPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFilesRecursively(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

async function collectTarEntries(
	cwd: string,
	config: TOML.JsonMap,
): Promise<string[]> {
	const entries = new Set<string>();
	entries.add(CONFIG_FILE);

	const skills = Array.isArray(config.skills) ? config.skills : [];
	for (const rawSkill of skills) {
		const skill = parseSkillEntry(rawSkill);
		if (!skill) {
			fail("Invalid skills entry in config.toml.");
		}
		if (isHostedSkill(skill)) {
			continue;
		}
		if (skill.source === "hosted" && !skill.slug) {
			fail("Invalid hosted skill slug in config.toml.");
		}
		const skillPath = skill.path;
		if (typeof skillPath !== "string" || skillPath.length === 0) {
			fail("Invalid skills path in config.toml.");
		}
		const abs = path.resolve(cwd, skillPath);
		let stat: Stats;
		try {
			stat = await fs.stat(abs);
		} catch {
			fail(`Skill path does not exist: ${skillPath}`);
		}
		if (!stat.isDirectory()) {
			fail(`Skill path must be a directory: ${skillPath}`);
		}
		const files = await listFilesRecursively(abs);
		for (const file of files) {
			entries.add(path.relative(cwd, file));
		}
	}

	const files = Array.isArray(config.files) ? config.files : [];
	for (const fileEntry of files) {
		const filePath = (fileEntry as TOML.JsonMap)?.path;
		if (typeof filePath !== "string" || filePath.length === 0) {
			fail("Invalid files path in config.toml.");
		}
		const abs = path.resolve(cwd, filePath);
		const rel = ensurePathUnderCwd(abs, cwd);
		let stat: Stats;
		try {
			stat = await fs.stat(abs);
		} catch {
			fail(`File path does not exist: ${filePath}`);
		}
		if (stat.isDirectory()) {
			const subFiles = await listFilesRecursively(abs);
			for (const file of subFiles) {
				entries.add(path.relative(cwd, file));
			}
		} else if (stat.isFile()) {
			entries.add(rel);
		} else {
			fail(`Unsupported file type: ${filePath}`);
		}
	}

	return Array.from(entries);
}

async function createAgentTar(
	cwd: string,
	config: TOML.JsonMap,
): Promise<{
	tarPath: string;
	cleanup: () => Promise<void>;
}> {
	const tarEntries = await collectTarEntries(cwd, config);
	const tmpDir = await fs.mkdtemp(
		path.join(os.tmpdir(), "giselle-agent-build-"),
	);
	const tarPath = path.join(tmpDir, "agent.tar");
	await tar.c(
		{
			cwd,
			file: tarPath,
			portable: true,
		},
		tarEntries,
	);
	return {
		tarPath,
		cleanup: async () => {
			await fs.rm(tmpDir, { recursive: true, force: true });
		},
	};
}

async function runBuild() {
	const { config, cwd } = await ensureConfigInCwd();
	const { baseUrl, apiKey } = readApiConfig();

	const { tarPath, cleanup } = await createAgentTar(cwd, config);
	let buildError: string | null = null;
	let cleanupError: string | null = null;
	let outputUrl: string | null = null;
	try {
		const tarBuffer = await fs.readFile(tarPath);
		const url = new URL("/api/agents/build", baseUrl).toString();
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/octet-stream",
				"x-vercel-protection-bypass": apiKey,
			},
			body: tarBuffer,
		});
		const text = await res.text();
		if (!res.ok) {
			buildError = `Build failed (${res.status}): ${text}`;
			return;
		}
		let data: { snapshotId?: string; slug?: string };
		try {
			data = JSON.parse(text) as { snapshotId?: string; slug?: string };
		} catch {
			buildError = "Invalid response from server.";
			return;
		}
		if (!data.snapshotId) {
			buildError = "snapshotId missing in response.";
			return;
		}
		if (!data.slug) {
			buildError = "slug missing in response.";
			return;
		}
		outputUrl = new URL(
			`/agents/${data.slug}/snapshots/${data.snapshotId}/chat`,
			baseUrl,
		)
			.toString()
			.trim();
	} finally {
		try {
			await cleanup();
		} catch (err) {
			cleanupError = err instanceof Error ? err.message : String(err);
		}
	}

	if (buildError) {
		fail(buildError);
	}
	if (cleanupError) {
		fail(`Failed to clean up temporary archive: ${cleanupError}`);
	}
	if (!outputUrl) {
		fail("Build completed without output URL.");
	}
	process.stdout.write(`${outputUrl}\n`);
}

async function runDelete(argSlug: string | undefined, force: boolean) {
	let slug = argSlug?.trim() ?? "";
	if (!slug) {
		const { config } = await ensureConfigInCwd();
		const configName = typeof config.name === "string" ? config.name : "";
		slug = toSlug(configName);
		if (!slug) {
			fail("Could not derive slug from config.toml name.");
		}
	}
	if (!HOSTED_SKILL_SLUG_RE.test(slug)) {
		fail("Slug must match ^[a-z0-9-]+$.");
	}

	if (!force) {
		const answer = (
			await promptLine(
				`Delete agent "${slug}"? This will remove all builds and data. [y/N] `,
			)
		)
			.trim()
			.toLowerCase();
		if (answer !== "y" && answer !== "yes") {
			process.stdout.write("Canceled.\n");
			return;
		}
	}

	const { baseUrl, apiKey } = readApiConfig();
	const url = new URL(
		`/api/agents/${encodeURIComponent(slug)}`,
		baseUrl,
	).toString();
	const response = await fetch(url, {
		method: "DELETE",
		headers: {
			"x-vercel-protection-bypass": apiKey,
		},
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		fail(`Delete failed (${response.status}): ${text}`);
	}

	process.stdout.write(`Deleted agent: ${slug}\n`);
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
	const content = `version = 2\n\nname = "${name}"\n`;
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

function readApiConfig() {
	const baseUrl = process.env.GISELLE_API_URL?.trim();
	if (!baseUrl) {
		fail("GISELLE_API_URL is required.");
	}
	const apiKey = process.env.GISELLE_API_KEY?.trim();
	if (!apiKey) {
		fail("GISELLE_API_KEY is required.");
	}
	return { baseUrl, apiKey };
}

function parseSkillEntry(input: unknown): SkillEntry | null {
	if (!input || typeof input !== "object") {
		return null;
	}
	const entry = input as TOML.JsonMap;
	const sourceRaw = entry.source;
	if (
		sourceRaw !== undefined &&
		sourceRaw !== "hosted" &&
		sourceRaw !== "local"
	) {
		return null;
	}
	const source =
		sourceRaw === "hosted" || sourceRaw === "local" ? sourceRaw : null;
	const pathValue = typeof entry.path === "string" ? entry.path : undefined;
	const slugValue = typeof entry.slug === "string" ? entry.slug : undefined;
	const parsed: SkillEntry = {};
	if (source) {
		parsed.source = source;
	}
	if (pathValue !== undefined) {
		parsed.path = pathValue;
	}
	if (slugValue !== undefined) {
		parsed.slug = slugValue;
	}
	return parsed;
}

function isLocalSkill(entry: SkillEntry) {
	return (
		(entry.source === undefined || entry.source === "local") && !!entry.path
	);
}

function isHostedSkill(entry: SkillEntry) {
	return entry.source === "hosted" && !!entry.slug;
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
	const already = skills.some((raw) => {
		const entry = parseSkillEntry(raw);
		if (!entry || !isLocalSkill(entry)) {
			return false;
		}
		return entry.path === normalizedRelPath;
	});
	if (already) {
		process.stdout.write("Skill already exists in config.\n");
		return;
	}
	config.skills = [...skills, { source: "local", path: normalizedRelPath }];
	await writeConfig(configPath, config);
	process.stdout.write(`Added skill: ${normalizedRelPath}\n`);
}

async function runAddHostedSkill(argSlug: string | undefined) {
	if (!argSlug) {
		fail("Slug is required. Usage: add-hosted-skill <slug>");
	}
	const slug = argSlug.trim();
	if (!HOSTED_SKILL_SLUG_RE.test(slug)) {
		fail("Slug must match ^[a-z0-9-]+$.");
	}

	const { config, configPath } = await ensureConfigInCwd();
	const { baseUrl, apiKey } = readApiConfig();
	const url = new URL(
		`/api/skills/${encodeURIComponent(slug)}`,
		baseUrl,
	).toString();
	const response = await fetch(url, {
		method: "GET",
		headers: {
			"x-giselle-protection-bypass": apiKey,
		},
	});
	if (response.status === 404) {
		fail(`Hosted skill not found: ${slug}`);
	}
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		fail(`Failed to resolve hosted skill (${response.status}): ${text}`);
	}

	const payload = (await response.json().catch(() => null)) as {
		slug?: string;
		files?: Array<{ pathname?: string }>;
	} | null;
	if (
		!payload?.slug ||
		!Array.isArray(payload.files) ||
		payload.files.length === 0
	) {
		fail("Invalid response from skill API.");
	}

	const skills = Array.isArray(config.skills) ? config.skills : [];
	const already = skills.some((raw) => {
		const entry = parseSkillEntry(raw);
		return !!entry && isHostedSkill(entry) && entry.slug === slug;
	});
	if (already) {
		process.stdout.write("Hosted skill already exists in config.\n");
		return;
	}

	config.skills = [...skills, { source: "hosted", slug }];
	await writeConfig(configPath, config);
	process.stdout.write(`Added hosted skill: ${slug}\n`);
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
		case "add-hosted-skill":
			await runAddHostedSkill(args[0]);
			break;
		case "edit-setup-script":
			await runEditSetupScript();
			break;
		case "build":
			await runBuild();
			break;
		case "delete": {
			const force = args.includes("--force");
			const positional = args.filter((arg) => arg !== "--force");
			await runDelete(positional[0], force);
			break;
		}
		default:
			printUsage();
			process.exit(1);
	}
}

main().catch((err) => {
	process.stderr.write(`Unexpected error: ${err?.message ?? String(err)}\n`);
	process.exit(1);
});
