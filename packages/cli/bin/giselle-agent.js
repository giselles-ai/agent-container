#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import ignore from "ignore";
import prompts from "prompts";
import * as tar from "tar";

const DEFAULT_API_URL = "http://localhost:3000";

function slugify(input) {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function getApiBase() {
	return process.env.GISSELLE_API_URL ?? DEFAULT_API_URL;
}

function getAuthHeaders() {
	const token = process.env.GISSELLE_API_TOKEN;
	return token ? { Authorization: `Bearer ${token}` } : {};
}

async function createAgent() {
	const response = await prompts([
		{
			type: "text",
			name: "name",
			message: "What is your agent name?",
			validate: (value) => (value ? true : "Name is required"),
		},
		{
			type: "text",
			name: "slug",
			message: "Agent slug?",
			initial: (prev) => slugify(prev ?? ""),
			validate: (value) =>
				/^[a-z0-9-]+$/.test(value) ? true : "Use a-z, 0-9, - only",
		},
		{
			type: "text",
			name: "description",
			message: "Description (optional)?",
		},
	]);

	if (!response.name || !response.slug) {
		console.error("Cancelled.");
		process.exit(1);
	}

	const targetDir = path.resolve(process.cwd(), response.slug);
	await fs.mkdir(targetDir, { recursive: false });
	await fs.mkdir(path.join(targetDir, "skills"));

	const agentConfig = {
		name: response.name,
		slug: response.slug,
		description: response.description || undefined,
		entrypoint: { cmd: "node", args: ["index.js"] },
		install: [],
		runtime: "node20",
		env: [],
	};

	await fs.writeFile(
		path.join(targetDir, "agent.json"),
		`${JSON.stringify(agentConfig, null, 2)}\n`,
	);

	await fs.writeFile(
		path.join(targetDir, "index.js"),
		`const prompt = process.env.GISSELLE_PROMPT ?? "";\nif (!prompt) {\n  console.log("No prompt provided.");\n} else {\n  console.log("You said:\\n" + prompt);\n}\n`,
	);

	await fs.writeFile(
		path.join(targetDir, "AGENTS.md"),
		`# ${response.name}\n\n${response.description || "Agent description."}\n`,
	);

	await fs.writeFile(
		path.join(targetDir, ".giselleignore"),
		`node_modules\n.next\ndist\n.DS_Store\n.git\n`,
	);

	await fs.writeFile(
		path.join(targetDir, "package.json"),
		`${JSON.stringify(
			{
				name: response.slug,
				private: true,
				type: "module",
				version: "0.1.0",
			},
			null,
			2,
		)}\n`,
	);

	console.log(`Created agent in ${targetDir}`);
}

function buildIgnore(projectDir) {
	const ig = ignore();
	const defaultIgnores = ["node_modules", ".next", "dist", ".DS_Store", ".git"];
	ig.add(defaultIgnores);

	const ignorePath = path.join(projectDir, ".giselleignore");
	return fs
		.readFile(ignorePath, "utf8")
		.then((content) => {
			ig.add(
				content
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean),
			);
			return ig;
		})
		.catch(() => ig);
}

async function createBundle(projectDir) {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "giselle-agent-"));
	const bundlePath = path.join(tempDir, "bundle.tar");
	const ig = await buildIgnore(projectDir);

	await tar.c(
		{
			file: bundlePath,
			cwd: projectDir,
			portable: true,
			filter: (entryPath) => {
				if (entryPath === ".") return true;
				const normalized = entryPath.replace(/\\\\/g, "/").replace(/^.\//, "");
				return !ig.ignores(normalized);
			},
		},
		["."],
	);

	return bundlePath;
}

async function readAgentConfig(projectDir) {
	const configPath = path.join(projectDir, "agent.json");
	const raw = await fs.readFile(configPath, "utf8");
	return JSON.parse(raw);
}

async function agentUp() {
	const projectDir = process.cwd();
	const config = await readAgentConfig(projectDir);
	if (!config.slug) {
		throw new Error("agent.json missing slug");
	}

	const apiBase = getApiBase();
	const bundlePath = await createBundle(projectDir);
	const uploadRes = await fetch(
		`${apiBase}/api/agents/${config.slug}/upload-url`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders(),
			},
		},
	);
	if (!uploadRes.ok) {
		throw new Error(`upload-url failed: ${uploadRes.status}`);
	}
	const uploadInfo = await uploadRes.json();
	const uploadUrl = uploadInfo.uploadUrl.startsWith("http")
		? uploadInfo.uploadUrl
		: `${apiBase}${uploadInfo.uploadUrl}`;

	const bundle = await fs.readFile(bundlePath);
	const uploadResult = await fetch(uploadUrl, {
		method: uploadInfo.method ?? "PUT",
		headers: {
			...(uploadInfo.headers ?? {}),
			...getAuthHeaders(),
		},
		body: bundle,
	});
	if (!uploadResult.ok) {
		throw new Error(`bundle upload failed: ${uploadResult.status}`);
	}

	const packageJsonPath = path.join(projectDir, "package.json");
	let version = "0.1.0";
	try {
		const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
		if (pkg?.version) version = pkg.version;
	} catch {}

	const manifest = {
		...config,
		bundlePath: uploadInfo.bundlePath,
		createdAt: new Date().toISOString(),
		version,
	};

	const manifestRes = await fetch(`${apiBase}/api/agents`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...getAuthHeaders(),
		},
		body: JSON.stringify(manifest),
	});
	if (!manifestRes.ok) {
		throw new Error(`manifest upload failed: ${manifestRes.status}`);
	}

	console.log(`Uploaded ${config.slug}`);
}

async function readStdin() {
	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data.trim()));
	});
}

async function agentRun(slug, prompt) {
	if (!slug) {
		throw new Error("Usage: agent run <slug> [prompt]");
	}
	let message = prompt ?? "";
	if (!message && !process.stdin.isTTY) {
		message = await readStdin();
	}
	if (!message) {
		const response = await prompts({
			type: "text",
			name: "prompt",
			message: "Prompt?",
		});
		message = response.prompt ?? "";
	}

	const apiBase = getApiBase();
	const runRes = await fetch(`${apiBase}/api/agents/${slug}/run`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...getAuthHeaders(),
		},
		body: JSON.stringify({
			messages: [
				{
					role: "user",
					parts: [{ type: "text", text: message }],
				},
			],
		}),
	});

	if (!runRes.ok || !runRes.body) {
		throw new Error(`run failed: ${runRes.status}`);
	}

	const reader = runRes.body.getReader();
	const decoder = new TextDecoder();
	let buffered = "";
	const handleEvent = (rawEvent) => {
		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice(5).trimStart());
			}
		}
		if (dataLines.length === 0) return;
		const data = dataLines.join("\n");
		if (data === "[DONE]") return;
		try {
			const payload = JSON.parse(data);
			switch (payload?.type) {
				case "text-delta": {
					if (typeof payload.delta === "string" && payload.delta.length > 0) {
						process.stdout.write(payload.delta);
					}
					break;
				}
				case "data-stderr": {
					const text = payload?.data?.text;
					if (typeof text === "string" && text.length > 0) {
						process.stderr.write(text);
					}
					break;
				}
				case "data-exit": {
					const code = payload?.data?.code ?? 0;
					process.stderr.write(`\n[exit ${code}]\n`);
					break;
				}
				case "error": {
					if (payload?.errorText) {
						process.stderr.write(`${payload.errorText}\n`);
					}
					break;
				}
				default:
					break;
			}
		} catch {
			process.stdout.write(`${data}\n`);
		}
	};
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffered += decoder.decode(value, { stream: true });
		buffered = buffered.replace(/\r\n/g, "\n");
		let eventIndex = buffered.indexOf("\n\n");
		while (eventIndex >= 0) {
			const rawEvent = buffered.slice(0, eventIndex);
			buffered = buffered.slice(eventIndex + 2);
			if (rawEvent.trim().length > 0) {
				handleEvent(rawEvent);
			}
			eventIndex = buffered.indexOf("\n\n");
		}
	}
	if (buffered.trim().length > 0) {
		handleEvent(buffered);
	}
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	try {
		if (command === "create") {
			await createAgent();
			return;
		}
		if (command === "up") {
			await agentUp();
			return;
		}
		if (command === "run") {
			await agentRun(rest[0], rest.slice(1).join(" "));
			return;
		}
		console.log("Usage: agent <create|up|run>");
		process.exit(1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

main();
