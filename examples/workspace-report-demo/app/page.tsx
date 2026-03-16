import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChatPanel } from "./chat-panel";

export default function Home() {
	const workspaceRoot = join(process.cwd(), "workspace");
	const workspaceInputPreviews = [
		{
			path: "./workspace/brief.md",
			title: "Report brief",
			description:
				"The task spec the agent should follow when drafting the report.",
			content: readFileSync(join(workspaceRoot, "brief.md"), "utf8"),
		},
		{
			path: "./workspace/data/sales.csv",
			title: "Sales dataset",
			description:
				"Weekly revenue and pipeline movement seeded into the sandbox.",
			content: readFileSync(join(workspaceRoot, "data", "sales.csv"), "utf8"),
		},
		{
			path: "./workspace/data/customers.json",
			title: "Customer status file",
			description:
				"Account-level context the agent should reflect in the report.",
			content: readFileSync(
				join(workspaceRoot, "data", "customers.json"),
				"utf8",
			),
		},
		{
			path: "./workspace/notes/internal-notes.md",
			title: "Internal notes",
			description:
				"Unstructured context the agent can combine with the data files.",
			content: readFileSync(
				join(workspaceRoot, "notes", "internal-notes.md"),
				"utf8",
			),
		},
	];
	const generatedArtifacts = [
		{
			path: "./workspace/output/report.md",
			title: "Markdown report",
			description:
				"Human-readable weekly report created inside the sandbox workspace.",
		},
		{
			path: "./workspace/output/highlights.json",
			title: "Highlights JSON",
			description:
				"Machine-readable summary suitable for downstream UI or automation.",
		},
	];

	return (
		<main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<ChatPanel
					workspaceInputPreviews={workspaceInputPreviews}
					generatedArtifacts={generatedArtifacts}
				/>
			</div>
		</main>
	);
}
