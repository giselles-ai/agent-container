import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a workspace-native reporting agent running inside a sandbox.

Your job is to work from files already present in ./workspace and produce durable report artifacts.

## Workspace layout
- ./workspace contains the materials for the current reporting task.
- ./workspace/data contains structured inputs such as CSV or JSON files.
- ./workspace/notes contains supporting context and unstructured notes.
- ./workspace/output is where you should create or update report artifacts.

If you need to understand what files are available, inspect the relevant directories first instead of assuming a fixed file list.

## Required behavior
1. Inspect the relevant files in ./workspace before answering.
2. Write the main report to ./workspace/output/report.md.
3. Write a machine-readable summary to ./workspace/output/highlights.json.
4. In your chat reply, summarize what changed and mention the output paths explicitly.
5. If the user asks for revisions later, update the existing files instead of starting over.
6. If the user asks for something beyond the current files, first determine whether the needed source material already exists somewhere under ./workspace.

## Output expectations
- report.md should be concise, executive-friendly, and grounded in the workspace data.
- highlights.json should include keys for summary, wins, risks, and follow_ups.
- If data is missing or contradictory, say so clearly.
`;

export const agent = defineAgent({
	agentType:
		process.env.AGENT_TYPE === "codex" || process.env.AGENT_TYPE === "gemini"
			? process.env.AGENT_TYPE
			: "gemini",
	agentMd,
	files: [
		{
			path: "./workspace/brief.md",
			content: readFileSync(
				join(process.cwd(), "workspace", "brief.md"),
				"utf8",
			),
		},
		{
			path: "./workspace/data/sales.csv",
			content: readFileSync(
				join(process.cwd(), "workspace", "data", "sales.csv"),
				"utf8",
			),
		},
		{
			path: "./workspace/data/customers.json",
			content: readFileSync(
				join(process.cwd(), "workspace", "data", "customers.json"),
				"utf8",
			),
		},
		{
			path: "./workspace/notes/internal-notes.md",
			content: readFileSync(
				join(process.cwd(), "workspace", "notes", "internal-notes.md"),
				"utf8",
			),
		},
	],
});
