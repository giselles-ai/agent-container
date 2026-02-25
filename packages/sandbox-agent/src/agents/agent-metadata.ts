import type { Sandbox } from "@vercel/sandbox";

export const AGENT_METADATA_PATH = "/.agent-metadata.json";

export type AgentMetadata = {
	cli: "gemini" | "codex";
};

export async function readAgentMetadata(
	sandbox: Sandbox,
): Promise<AgentMetadata | null> {
	let buffer: Buffer | null;

	try {
		buffer = await sandbox.readFileToBuffer({
			path: AGENT_METADATA_PATH,
		});
	} catch {
		return null;
	}

	if (!buffer) {
		return null;
	}

	try {
		const parsed = JSON.parse(new TextDecoder().decode(buffer));

		if (
			parsed &&
			typeof parsed === "object" &&
			(parsed.cli === "gemini" || parsed.cli === "codex")
		) {
			return parsed as AgentMetadata;
		}
		return null;
	} catch {
		return null;
	}
}
