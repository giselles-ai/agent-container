import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { convertToModelMessages, ToolLoopAgent, type UIMessage } from "ai";
import {
	createBashTool,
	experimental_createSkillTool as createSkillTool,
} from "bash-tool";
import simpleGit from "simple-git";

interface PostRequest {
	messages: UIMessage[];
	skillsSource?: string; // "owner/repo [skillName]", URL, or local path
}

interface ParsedSource {
	type: "github" | "url";
	url: string;
	skillName: string; // Specific skill to load
}

/**
 * Parse source with optional skill name
 * Formats:
 *   - "anthropics/skills pptx" -> GitHub repo + skill name
 *   - "anthropics/skills@pptx" -> GitHub repo + skill name (alternative)
 *   - "anthropics/skills" -> GitHub repo (all skills)
 *   - "https://github.com/anthropics/skills" -> Full URL
 *   - "./skills" -> Local path
 */
function parseSource(input: string): ParsedSource {
	const parts = input.trim().split(/\s+/);
	const source = parts[0]!;
	const skillName = parts[1]; // Optional skill name

	// Check for @skill syntax (owner/repo@skillname)
	let actualSource = source;
	let extractedSkillName = skillName;
	if (source.includes("@")) {
		const [repo, skill] = source.split("@");
		actualSource = repo!;
		extractedSkillName = skill || skillName;
	}

	// GitHub shorthand: owner/repo
	if (actualSource.match(/^[^/]+\/[^/]+$/) && !actualSource.includes("://")) {
		return {
			type: "github",
			url: `https://github.com/${actualSource}.git`,
			skillName: extractedSkillName,
		};
	}

	// GitHub URL
	if (actualSource.includes("github.com")) {
		return {
			type: "github",
			url: actualSource.endsWith(".git") ? actualSource : `${actualSource}.git`,
			skillName: extractedSkillName,
		};
	}

	// Other URLs
	if (
		actualSource.startsWith("http://") ||
		actualSource.startsWith("https://")
	) {
		return {
			type: "url",
			url: actualSource,
			skillName: extractedSkillName,
		};
	}

	// Default: treat as GitHub shorthand
	return {
		type: "github",
		url: `https://github.com/${actualSource}.git`,
		skillName: extractedSkillName,
	};
}

/**
 * Clone repository to temp directory
 */
async function cloneRepo(url: string): Promise<string> {
	const tempDir = await mkdtemp(path.join(tmpdir(), "skills-"));
	const git = simpleGit({ timeout: { block: 60000 } });

	try {
		await git.clone(url, tempDir, ["--depth", "1"]);
		return tempDir;
	} catch (error) {
		await rm(tempDir, { recursive: true, force: true }).catch(() => {});
		throw new Error(
			`Failed to clone ${url}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export async function POST(req: Request) {
	const { messages: requestMessages }: PostRequest = await req.json();

	const skillsSource = "anthropics/skills pptx";
	// Resolve skills directory
	let skillsDirectory: string | undefined;
	let tempDir: string | null = null;
	let requestedSkill: string | undefined;

	const parsed = parseSource(skillsSource);
	requestedSkill = parsed.skillName;

	if (parsed.type === "github" || parsed.type === "url") {
		console.log(`Cloning skills from ${skillsSource}...`);
		tempDir = await cloneRepo(parsed.url);
		console.log(tempDir);
		skillsDirectory = `${tempDir}/skills`;
	}

	if (skillsDirectory === undefined) {
		throw new Error(`Failed to clone ${skillsSource}`);
	}

	const {
		skill,
		skills: allSkills,
		files,
		instructions,
	} = await createSkillTool({
		skillsDirectory,
	});

	// Filter to requested skill if specified
	const skills = requestedSkill
		? allSkills.filter((s) => {
				const skillName = requestedSkill.toLowerCase();
				const sName = s.name.toLowerCase().replace(/\s+/g, "-");
				const reqName = skillName.replace(/\s+/g, "-");
				return s.name.toLowerCase() === skillName || sName === reqName;
			})
		: allSkills;

	if (requestedSkill) {
		if (skills.length === 0) {
			throw new Error(
				`Skill "${requestedSkill}" not found. Available skills: ${allSkills.map((s) => s.name).join(", ")}`,
			);
		}
		console.log(`Using skill: ${skills[0]?.name}`);
	}

	const sandbox = await Sandbox.create();

	console.log(`Sandbox created: ${sandbox.sandboxId}`);

	// Install system packages (Amazon Linux 2023 uses dnf)
	await sandbox.runCommand({
		cmd: "dnf",
		args: ["install", "-y", "libreoffice", "poppler-utils"],
		sudo: true,
	});

	// Install Python packages
	await sandbox.runCommand({
		cmd: "pip",
		args: ["install", "markitdown[pptx]", "defusedxml"],
	});

	// Install npm packages globally
	await sandbox.runCommand({
		cmd: "npm",
		args: [
			"install",
			"-g",
			"pptxgenjs",
			"playwright",
			"react-icons",
			"react",
			"react-dom",
			"sharp",
		],
	});

	// Create bash tool with skill files
	const { tools } = await createBashTool({
		sandbox,
		files,
		extraInstructions: instructions,
	});

	console.log("Available skills:");
	for (const skill of skills) {
		console.log(`  - ${skill.name}: ${skill.description}`);
	}

	// Create the agent with skills
	const agent = new ToolLoopAgent({
		model: "anthropic/claude-haiku-4.5",
		tools: {
			skill,
			bash: tools.bash,
		},
		instructions: `You are a helpful assistant with access to skills.
  Use the skill tool to discover how to use a skill, then use bash to run its scripts.
  Skills are located at ./skills/<skill-name>/.`,
	});

	const stream = await agent.stream({
		messages: await convertToModelMessages(requestMessages),
	});
	return stream.toUIMessageStreamResponse();
}
