import path from "node:path";
import * as TOML from "@iarna/toml";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import tar from "tar-stream";
import {
	findHostedSkill,
	putBuildMeta,
	resolveSkillPrefix,
} from "@/lib/agent/storage";

type TarEntry = {
	path: string;
	content: Buffer;
};

type AgentConfig = {
	version: number;
	name: string;
	skills?: Array<
		{ source?: "local"; path: string } | { source: "hosted"; slug: string }
	>;
	files?: Array<{ path: string }>;
	setup?: { script?: string };
};

type LocalSkillConfig = {
	source?: "local";
	path: string;
};

type HostedSkillConfig = {
	source: "hosted";
	slug: string;
};

function toSlug(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
}

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
	if (config.version === 1) {
		throw new Error("config.toml version 1 is deprecated. Use version 2.");
	}
	if (config.version !== 2) {
		throw new Error("config.toml version must be 2.");
	}
	return config;
}

function getEntriesUnder(entries: TarEntry[], root: string): TarEntry[] {
	const normalized = normalizeTarPath(root);
	return entries.filter((entry) => {
		return entry.path === normalized || entry.path.startsWith(`${normalized}/`);
	});
}

function toLocalSkillConfig(value: unknown): LocalSkillConfig | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const source = record.source;
	if (source !== undefined && source !== "local") {
		return null;
	}
	const skillPath = record.path;
	if (typeof skillPath !== "string" || skillPath.length === 0) {
		return null;
	}
	return {
		source: "local",
		path: skillPath,
	};
}

function toHostedSkillConfig(value: unknown): HostedSkillConfig | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (record.source !== "hosted") {
		return null;
	}
	const slug = record.slug;
	if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
		return null;
	}
	return {
		source: "hosted",
		slug,
	};
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
	const slug = toSlug(config.name);
	if (!slug) {
		return NextResponse.json(
			{ error: "config.toml name is invalid for slug generation." },
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
		const hosted = toHostedSkillConfig(skill);
		if (hosted) {
			const token = process.env.BLOB_READ_WRITE_TOKEN;
			const found = await findHostedSkill(hosted.slug, token);
			if (!found) {
				return NextResponse.json(
					{ error: `Hosted skill not found: ${hosted.slug}` },
					{ status: 400 },
				);
			}
			const prefix = resolveSkillPrefix(hosted.slug);
			for (const file of found.files) {
				if (!file.pathname.startsWith(prefix)) {
					continue;
				}
				const relative = file.pathname.slice(prefix.length);
				if (!relative) {
					continue;
				}
				const response = await fetch(file.url);
				if (!response.ok) {
					return NextResponse.json(
						{
							error: `Failed to fetch hosted skill file: ${file.pathname}`,
						},
						{ status: 400 },
					);
				}
				const arrayBuffer = await response.arrayBuffer();
				agentSkills.push({
					path: `/home/vercel-sandbox/.gemini/skills/${hosted.slug}/${relative}`,
					content: Buffer.from(arrayBuffer),
				});
			}
			continue;
		}

		const local = toLocalSkillConfig(skill);
		if (!local) {
			return NextResponse.json(
				{ error: "Invalid skills entry in config.toml." },
				{ status: 400 },
			);
		}

		const skillPath = local.path;
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

	await sandbox.writeFiles([
		{
			path: "/home/vercel-sandbox/.gemini/GEMINI.md",
			content: Buffer.from(
				[
					"# System Environment",
					"",
					"This environment is Fedora-based (Vercel Sandbox).",
					"The package manager is `dnf`.",
					"",
					"- ALWAYS use `dnf` to install packages (e.g. `dnf install -y <package>`).",
					"- NEVER use `yum` or `apt-get` — they are not available.",
					"",
				].join("\n"),
			),
		},
	]);

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
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	await putBuildMeta(
		{
			slug,
			snapshotId: snapshot.snapshotId,
			createdAt: new Date().toISOString(),
		},
		token,
	);
	return NextResponse.json({ snapshotId: snapshot.snapshotId, slug });
}
