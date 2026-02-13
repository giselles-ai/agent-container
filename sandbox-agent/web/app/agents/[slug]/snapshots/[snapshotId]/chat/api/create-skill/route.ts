import { put } from "@vercel/blob";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";
import { requireApiToken } from "@/lib/agent/auth";

type CreateSkillRequest = {
	sandboxId?: string;
	sessionId?: string;
};

type SessionToolCall = {
	name?: string;
	args?: Record<string, unknown>;
};

type SessionMessage = {
	type?: "user" | "gemini";
	content?: string;
	toolCalls?: SessionToolCall[];
	thoughts?: Array<{ subject?: string; description?: string }>;
};

type SessionLog = {
	sessionId?: string;
	messages?: SessionMessage[];
};

const GEMINI_API_URL =
	"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const PROMPT_MAX_CHARS = 40_000;
const FINAL_CONTENT_MAX_CHARS = 1_500;

function sanitizeSessionPrefix(sessionId: string) {
	const prefix = sessionId
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	return prefix.slice(0, 8);
}

function toSlug(value: string) {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");
	return slug;
}

function parseGeneratedSkill(skillMd: string) {
	const frontmatterMatch = skillMd.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!frontmatterMatch) {
		return {
			name: "",
			description: "",
			content: skillMd,
		};
	}

	const frontmatter = frontmatterMatch[1] ?? "";
	const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
	const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
	const name = (nameMatch?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
	const description = (descriptionMatch?.[1] ?? "")
		.trim()
		.replace(/^["']|["']$/g, "");

	return {
		name,
		description,
		content: skillMd,
	};
}

function selectSessionPathFromFindOutput(stdout: string) {
	const rows = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (rows.length === 0) return null;

	const best = rows
		.map((row) => {
			const [timeRaw, ...rest] = row.split(" ");
			const time = Number(timeRaw);
			const path = rest.join(" ").trim();
			return { time, path };
		})
		.filter((row) => Number.isFinite(row.time) && row.path.length > 0)
		.sort((a, b) => b.time - a.time)[0];

	return best?.path ?? null;
}

function buildLogSummary(log: SessionLog) {
	const messages = log.messages ?? [];
	const userMessages = messages
		.filter((message) => message.type === "user")
		.map((message) => message.content?.trim())
		.filter((content): content is string =>
			Boolean(content && content.length > 0),
		);

	const toolCalls = messages.flatMap((message) =>
		(message.toolCalls ?? [])
			.map((call) => ({
				name: call.name ?? "",
				args: call.args ?? {},
			}))
			.filter((call) => call.name.length > 0),
	);

	const thoughts = messages.flatMap((message) =>
		(message.thoughts ?? [])
			.map((thought) => ({
				subject: thought.subject ?? "",
				description: thought.description ?? "",
			}))
			.filter(
				(thought) =>
					thought.subject.length > 0 || thought.description.length > 0,
			),
	);

	const finalGeminiMessage = [...messages]
		.reverse()
		.find(
			(message) =>
				message.type === "gemini" &&
				typeof message.content === "string" &&
				message.content.trim().length > 0,
		)?.content;

	return {
		sessionId: log.sessionId ?? "",
		userMessages,
		toolCalls,
		thoughts,
		finalAssistantSummary: (finalGeminiMessage ?? "").slice(
			0,
			FINAL_CONTENT_MAX_CHARS,
		),
	};
}

function buildSkillPrompt(summary: ReturnType<typeof buildLogSummary>) {
	const serialized = JSON.stringify(summary, null, 2);
	const clipped =
		serialized.length > PROMPT_MAX_CHARS
			? `${serialized.slice(0, PROMPT_MAX_CHARS)}\n... [truncated]`
			: serialized;

	return [
		"You are generating a single SKILL.md document from chat/session logs.",
		"Return markdown only, no surrounding explanation.",
		"",
		"Requirements:",
		"- Must follow Agent Skills open format style.",
		"- Include YAML frontmatter with exactly: name, description.",
		"- name must be lower-case hyphen-case slug (letters, digits, hyphen).",
		"- description must be concise and useful.",
		"- Body must describe reusable workflow and clear steps.",
		"- Identify run_shell_command call args.command patterns and mention script candidates in the body.",
		"- Do not include raw tool result dumps.",
		"",
		"Output format:",
		"---",
		"name: your-skill-name",
		'description: "One sentence description"',
		"---",
		"# ...",
		"",
		"Session summary JSON:",
		clipped,
	].join("\n");
}

async function generateSkillMarkdown(prompt: string, apiKey: string) {
	const response = await fetch(
		`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						role: "user",
						parts: [{ text: prompt }],
					},
				],
				generationConfig: {
					temperature: 0.2,
					maxOutputTokens: 4096,
				},
			}),
		},
	);

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(
			`Gemini generation failed (${response.status}): ${text.slice(0, 500)}`,
		);
	}

	const json = (await response.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	const text =
		json.candidates?.[0]?.content?.parts
			?.map((part) => part.text ?? "")
			.join("\n")
			.trim() ?? "";
	if (!text) {
		throw new Error("Gemini returned empty content");
	}
	return text;
}

export async function POST(req: Request, _ctx: unknown) {
	const authError = requireApiToken(req);
	if (authError) return authError;

	const body = (await req
		.json()
		.catch(() => null)) as CreateSkillRequest | null;
	const sandboxId = body?.sandboxId?.trim();
	const sessionId = body?.sessionId?.trim();
	if (!sandboxId || !sessionId) {
		return NextResponse.json(
			{ error: "sandboxId and sessionId are required" },
			{ status: 400 },
		);
	}

	const sessionPrefix = sanitizeSessionPrefix(sessionId);
	if (sessionPrefix.length < 8) {
		return NextResponse.json(
			{ error: "sessionId is invalid" },
			{ status: 400 },
		);
	}

	const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
	if (!geminiApiKey) {
		return NextResponse.json(
			{ error: "GEMINI_API_KEY is not configured" },
			{ status: 500 },
		);
	}

	try {
		const sandbox = await Sandbox.get({ sandboxId });
		const findResult = await sandbox.runCommand({
			cmd: "bash",
			args: [
				"-lc",
				`find /home/vercel-sandbox/.gemini/tmp -type f -name "*${sessionPrefix}*.json" -printf "%T@ %p\\n" 2>/dev/null`,
			],
			cwd: "/vercel/sandbox",
		});
		const findOutput = await findResult.stdout();
		const sessionPath = selectSessionPathFromFindOutput(findOutput);
		if (!sessionPath) {
			return NextResponse.json(
				{ error: "Session file not found in sandbox" },
				{ status: 404 },
			);
		}

		const buffer = await sandbox.readFileToBuffer({ path: sessionPath });
		if (!buffer) {
			return NextResponse.json(
				{ error: "Session file is not readable" },
				{ status: 404 },
			);
		}

		let log: SessionLog;
		try {
			log = JSON.parse(buffer.toString("utf8")) as SessionLog;
		} catch {
			return NextResponse.json(
				{ error: "Session JSON is invalid" },
				{ status: 422 },
			);
		}

		const summary = buildLogSummary(log);
		const prompt = buildSkillPrompt(summary);

		let skillMd: string;
		try {
			skillMd = await generateSkillMarkdown(prompt, geminiApiKey);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return NextResponse.json({ error: message }, { status: 502 });
		}

		const parsed = parseGeneratedSkill(skillMd);
		const normalizedName = toSlug(parsed.name);
		const slug =
			normalizedName.length > 0 ? normalizedName : `skill-${Date.now()}`;
		const name = normalizedName.length > 0 ? normalizedName : slug;
		const description =
			parsed.description.trim().length > 0
				? parsed.description.trim()
				: "Generated skill from chat session";

		const hasFrontmatter = /^---\n[\s\S]*?\n---\n?/.test(skillMd);
		const persistedSkillMd = hasFrontmatter
			? skillMd
			: `---\nname: ${name}\ndescription: "${description}"\n---\n\n${skillMd}`;

		try {
			await put(`skills/${slug}/SKILL.md`, persistedSkillMd, {
				access: "public",
				addRandomSuffix: false,
				allowOverwrite: true,
				token: process.env.BLOB_READ_WRITE_TOKEN,
				contentType: "text/markdown",
			});
		} catch {
			return NextResponse.json(
				{ error: "Failed to save skill to Blob" },
				{ status: 500 },
			);
		}

		return NextResponse.json({
			slug,
			name,
			description,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to create skill";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
