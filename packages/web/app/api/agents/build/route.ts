import path from "node:path";
import * as TOML from "@iarna/toml";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import tar from "tar-stream";

type TarEntry = {
	path: string;
	content: Buffer;
};

type AgentConfig = {
	version: number;
	name: string;
	skills?: Array<{ path: string }>;
	files?: Array<{ path: string }>;
	setup?: { script?: string };
};

function normalizeTarPath(p: string): string {
	return p.replace(/^[.\\/]+/, "").replace(/\\/g, "/");
}

async function extractTar(buffer: Buffer): Promise<TarEntry[]> {
	return new Promise((resolve, reject) => {
		const extract = tar.extract();
		const entries: TarEntry[] = [];
		extract.on("entry", (header, stream, next) => {
			const chunks: Buffer[] = [];
			stream.on("data", (chunk) => chunks.push(chunk as Buffer));
			stream.on("end", () => {
				if (header.type === "file") {
					entries.push({
						path: normalizeTarPath(header.name),
						content: Buffer.concat(chunks),
					});
				}
				next();
			});
			stream.on("error", reject);
		});
		extract.on("finish", () => resolve(entries));
		extract.on("error", reject);
		extract.end(buffer);
	});
}

function parseConfig(entries: TarEntry[]): AgentConfig {
	const configEntry = entries.find((entry) => entry.path === "config.toml");
	if (!configEntry) {
		throw new Error("config.toml not found in tar.");
	}
	let config: AgentConfig;
	try {
		config = TOML.parse(configEntry.content.toString("utf8")) as AgentConfig;
	} catch {
		throw new Error("config.toml is not valid TOML.");
	}
	if (config.version !== 1) {
		throw new Error("config.toml version must be 1.");
	}
	return config;
}

function getEntriesUnder(entries: TarEntry[], root: string): TarEntry[] {
	const normalized = normalizeTarPath(root);
	return entries.filter((entry) => {
		return entry.path === normalized || entry.path.startsWith(`${normalized}/`);
	});
}

export async function POST(req: Request) {
	let buffer: Buffer;
	try {
		const arrayBuffer = await req.arrayBuffer();
		buffer = Buffer.from(arrayBuffer);
	} catch {
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 },
		);
	}

	let entries: TarEntry[];
	try {
		entries = await extractTar(buffer);
	} catch {
		return NextResponse.json({ error: "Invalid tar file" }, { status: 400 });
	}

	let config: AgentConfig;
	try {
		config = parseConfig(entries);
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Invalid config" },
			{ status: 400 },
		);
	}

	const agentFiles: Array<{ path: string; content: Buffer }> = [];
	const agentSkills: Array<{ path: string; content: Buffer }> = [];

	const files = config.files ?? [];
	for (const file of files) {
		const filePath = file.path;
		if (!filePath) continue;
		const matched = getEntriesUnder(entries, filePath);
		if (matched.length === 0) {
			return NextResponse.json(
				{ error: `files.path not found in tar: ${filePath}` },
				{ status: 400 },
			);
		}
		for (const entry of matched) {
			agentFiles.push({
				path: `/vercel/sandbox/${entry.path}`,
				content: entry.content,
			});
		}
	}

	const skills = config.skills ?? [];
	for (const skill of skills) {
		const skillPath = skill.path;
		if (!skillPath) continue;
		const matched = getEntriesUnder(entries, skillPath);
		if (matched.length === 0) {
			return NextResponse.json(
				{ error: `skills.path not found in tar: ${skillPath}` },
				{ status: 400 },
			);
		}
		const baseName = path.posix.basename(normalizeTarPath(skillPath));
		for (const entry of matched) {
			const relative = normalizeTarPath(entry.path).slice(
				normalizeTarPath(skillPath).length,
			);
			const trimmed = relative.replace(/^\//, "");
			const destPath = trimmed.length
				? `/home/vercel-sandbox/.gemini/skills/${baseName}/${trimmed}`
				: `/home/vercel-sandbox/.gemini/skills/${baseName}`;
			agentSkills.push({
				path: destPath,
				content: entry.content,
			});
		}
	}

	const sandbox = await Sandbox.create({
		source: {
			type: "snapshot",
			snapshotId: "snap_Jhmuk7xWcnrQGk1czArYhzgtODcj",
		},
	});
	if (agentFiles.length > 0) {
		await sandbox.writeFiles(agentFiles);
	}
	if (agentSkills.length > 0) {
		await sandbox.writeFiles(agentSkills);
	}

	const setupScript = config.setup?.script ?? "";
	const lines = setupScript.split("\n").map((line) => line.trim());
	for (const line of lines) {
		if (!line) continue;
		await sandbox.runCommand({
			cmd: "bash",
			args: ["-lc", line],
		});
	}

	const snapshot = await sandbox.snapshot();
	return NextResponse.json({ snapshotId: snapshot.snapshotId });
}
